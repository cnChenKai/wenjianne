import sqlite3
from flask import Flask, request, jsonify
import datetime

app = Flask(__name__)

DATABASE_PATH = '../database/file_flow.db'

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Helper function to get a document by ID
def get_document(document_id, conn=None):
    close_conn_after = False
    if conn is None:
        conn = get_db_connection()
        close_conn_after = True

    document = conn.execute("SELECT * FROM documents WHERE id = ?", (document_id,)).fetchone()

    if close_conn_after:
        conn.close()
    return document

@app.route('/api/documents', methods=['GET', 'POST'])
def documents_api():
    if request.method == 'POST':
        return create_document()
    elif request.method == 'GET':
        return get_all_documents()

def create_document(): # Renamed from documents_api to create_document
    data = request.get_json()

    if not data:
        return jsonify({"error": "Invalid input"}), 400

    name = data.get('name')
    originating_unit = data.get('originating_unit')
    serial_number = data.get('serial_number') # Making serial_number required for now

    # Validate required fields
    if not name:
        return jsonify({"error": "Missing required field: name"}), 400
    if not originating_unit:
        return jsonify({"error": "Missing required field: originating_unit"}), 400
    if not serial_number: # Added this check
        return jsonify({"error": "Missing required field: serial_number"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Check for serial_number uniqueness
        cursor.execute("SELECT id FROM documents WHERE serial_number = ?", (serial_number,))
        if cursor.fetchone():
            return jsonify({"error": f"Serial number '{serial_number}' already exists"}), 409

        # Prepare data for insertion
        document_data = {
            'serial_number': serial_number,
            'name': name,
            'document_number': data.get('document_number'),
            'originating_unit': originating_unit,
            'deadline': data.get('deadline'),
            'category': data.get('category')
            # status and entry_time have defaults in DB
        }

        # Filter out None values for fields that are optional and can be NULL in DB
        # For required fields, they are already validated or should have a value.
        document_data_filtered = {k: v for k, v in document_data.items() if v is not None or k in ['serial_number', 'name', 'originating_unit']}

        columns = ', '.join(document_data_filtered.keys())
        placeholders = ', '.join(['?'] * len(document_data_filtered))
        values = tuple(document_data_filtered.values())

        cursor.execute(f"INSERT INTO documents ({columns}) VALUES ({placeholders})", values)
        conn.commit()
        document_id = cursor.lastrowid

        return jsonify({"message": "Document created successfully", "id": document_id}), 201

    except sqlite3.IntegrityError as e:
        conn.rollback()
        # This can catch issues like CHECK constraint failures (e.g., invalid category)
        return jsonify({"error": f"Database integrity error: {e}"}), 400
    except sqlite3.Error as e:
        conn.rollback()
        app.logger.error(f"Database error: {e}")
        return jsonify({"error": "A database error occurred"}), 500
    finally:
        if conn:
            conn.close()

def get_all_documents():
    conn = get_db_connection()
    try:
        query_params = []
        sql_query = "SELECT id, serial_number, name, document_number, originating_unit, deadline, category, entry_time, status, completed_by, completion_time FROM documents WHERE 1=1"

        name_keyword = request.args.get('name_keyword')
        if name_keyword:
            sql_query += " AND name LIKE ?"
            query_params.append(f"%{name_keyword}%")

        doc_number = request.args.get('document_number')
        if doc_number:
            sql_query += " AND document_number LIKE ?"
            query_params.append(f"%{doc_number}%")

        originating_unit = request.args.get('originating_unit')
        if originating_unit:
            sql_query += " AND originating_unit LIKE ?"
            query_params.append(f"%{originating_unit}%")

        category = request.args.get('category')
        if category:
            sql_query += " AND category = ?"
            query_params.append(category)

        entry_date_from = request.args.get('entry_date_from')
        if entry_date_from:
            sql_query += " AND date(entry_time) >= ?"
            query_params.append(entry_date_from)

        entry_date_to = request.args.get('entry_date_to')
        if entry_date_to:
            sql_query += " AND date(entry_time) <= ?"
            query_params.append(entry_date_to)

        status = request.args.get('status')
        if status:
            sql_query += " AND status = ?"
            query_params.append(status)

        sql_query += " ORDER BY entry_time DESC"

        documents_cursor = conn.execute(sql_query, query_params)
        documents = [dict(row) for row in documents_cursor.fetchall()]
        return jsonify(documents), 200

    except sqlite3.Error as e:
        app.logger.error(f"Database error getting all documents: {e}")
        return jsonify({"error": "A database error occurred while fetching documents"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/documents/<int:document_id>/flow', methods=['GET'])
def get_document_flow(document_id):
    conn = get_db_connection()
    try:
        # First, check if document exists to return 404 if not
        document = get_document(document_id, conn)
        if not document:
            return jsonify({"error": "Document not found"}), 404

        flow_records_cursor = conn.execute("""
            SELECT id, document_id, action_type, operator_name, recipient_name, returner_name, flow_time, notes, stage
            FROM flow_records
            WHERE document_id = ?
            ORDER BY flow_time ASC
        """, (document_id,))
        flow_records = [dict(row) for row in flow_records_cursor.fetchall()]
        return jsonify(flow_records), 200
    except sqlite3.Error as e:
        app.logger.error(f"Database error getting flow history: {e}")
        return jsonify({"error": "A database error occurred while fetching flow history"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/documents/<int:document_id>/send', methods=['POST'])
def send_document(document_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid input"}), 400

    recipient_name = data.get('recipient_name')
    stage = data.get('stage')
    sender_name = data.get('sender_name') # This is the operator_name for the flow record
    notes = data.get('notes')

    if not recipient_name:
        return jsonify({"error": "Missing required field: recipient_name"}), 400
    if not stage:
        return jsonify({"error": "Missing required field: stage"}), 400
    if not sender_name:
        return jsonify({"error": "Missing required field: sender_name (operator)"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Validate that the document exists
        document = get_document(document_id, conn)
        if not document:
            return jsonify({"error": "Document not found"}), 404

        # Insert into flow_records
        flow_columns = ['document_id', 'action_type', 'operator_name', 'recipient_name', 'stage']
        flow_values = [document_id, 'send', sender_name, recipient_name, stage]

        if notes is not None:
            flow_columns.append('notes')
            flow_values.append(notes)

        placeholders = ', '.join(['?'] * len(flow_values))
        cursor.execute(f"INSERT INTO flow_records ({', '.join(flow_columns)}) VALUES ({placeholders})", tuple(flow_values))
        flow_record_id = cursor.lastrowid

        # Update document status
        new_status = f"Sent to {recipient_name} at stage {stage}"
        cursor.execute("UPDATE documents SET status = ? WHERE id = ?", (new_status, document_id))

        conn.commit()

        flow_record = conn.execute("SELECT * FROM flow_records WHERE id = ?", (flow_record_id,)).fetchone()
        return jsonify({"message": "Document sent successfully", "flow_record": dict(flow_record)}), 200

    except sqlite3.Error as e:
        conn.rollback()
        app.logger.error(f"Database error on send: {e}")
        return jsonify({"error": "A database error occurred while sending the document"}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/documents/<int:document_id>/receive', methods=['POST'])
def receive_document(document_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid input"}), 400

    returner_name = data.get('returner_name')
    stage = data.get('stage')
    receiver_name = data.get('receiver_name') # This is the operator_name for the flow record
    notes = data.get('notes')

    if not returner_name:
        return jsonify({"error": "Missing required field: returner_name"}), 400
    if not stage:
        return jsonify({"error": "Missing required field: stage"}), 400
    if not receiver_name:
        return jsonify({"error": "Missing required field: receiver_name (operator)"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Validate that the document exists
        document = get_document(document_id, conn)
        if not document:
            return jsonify({"error": "Document not found"}), 404

        # Insert into flow_records
        flow_columns = ['document_id', 'action_type', 'operator_name', 'returner_name', 'stage']
        flow_values = [document_id, 'receive', receiver_name, returner_name, stage]

        if notes is not None:
            flow_columns.append('notes')
            flow_values.append(notes)

        placeholders = ', '.join(['?'] * len(flow_values))
        cursor.execute(f"INSERT INTO flow_records ({', '.join(flow_columns)}) VALUES ({placeholders})", tuple(flow_values))
        flow_record_id = cursor.lastrowid

        # Update document status
        new_status = f"Received from {returner_name} at stage {stage}"
        cursor.execute("UPDATE documents SET status = ? WHERE id = ?", (new_status, document_id))

        conn.commit()

        flow_record = conn.execute("SELECT * FROM flow_records WHERE id = ?", (flow_record_id,)).fetchone()
        return jsonify({"message": "Document received successfully", "flow_record": dict(flow_record)}), 200

    except sqlite3.Error as e:
        conn.rollback()
        app.logger.error(f"Database error on receive: {e}")
        return jsonify({"error": "A database error occurred while receiving the document"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/documents/<int:document_id>/complete', methods=['POST'])
def complete_document(document_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid input"}), 400

    completed_by = data.get('completed_by')
    if not completed_by:
        return jsonify({"error": "Missing required field: completed_by"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        document = get_document(document_id, conn)
        if not document:
            return jsonify({"error": "Document not found"}), 404

        if document['status'] == 'archived':
            # Consider if this should be an error or just return the current state
            return jsonify({"message": "Document is already archived", "document": dict(document)}), 409
            # Or you could return 200 with a specific message if 409 is too "error-like"

        completion_time_utc = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

        cursor.execute("""
            UPDATE documents
            SET status = ?, completed_by = ?, completion_time = ?
            WHERE id = ?
        """, ('archived', completed_by, completion_time_utc, document_id))

        conn.commit()

        updated_document = get_document(document_id, conn) # Fetch the updated document
        return jsonify({"message": "Document marked as completed and archived", "document": dict(updated_document)}), 200

    except sqlite3.Error as e:
        conn.rollback()
        app.logger.error(f"Database error on complete: {e}")
        return jsonify({"error": "A database error occurred while completing the document"}), 500
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    # Note: For development only. In production, use a WSGI server like Gunicorn.
    app.run(debug=True, port=5001)
