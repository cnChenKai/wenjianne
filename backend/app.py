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
    serial_number_input = data.get('serial_number') # User-provided serial number

    # Validate required fields (name and originating_unit are still mandatory)
    if not name:
        return jsonify({"error": "Missing required field: name"}), 400
    if not originating_unit:
        return jsonify({"error": "Missing required field: originating_unit"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    final_serial_number = None

    try:
        if serial_number_input and serial_number_input.strip():
            final_serial_number = serial_number_input.strip()
            # Check for serial_number uniqueness if provided by user
            cursor.execute("SELECT id FROM documents WHERE serial_number = ?", (final_serial_number,))
            if cursor.fetchone():
                return jsonify({"error": f"Serial number '{final_serial_number}' already exists"}), 409
        else:
            # Generate serial_number if not provided or empty
            # Loop to ensure uniqueness for generated SN, though highly unlikely to collide with timestamp.
            # For this iteration, we assume one attempt is sufficient as per prompt.
            # If DB constraint catches it, a general IntegrityError will be returned.
            final_serial_number = f"DOC-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}"
            # Optional: Add a check here if truly paranoid about generated SN collision before INSERT attempt
            # cursor.execute("SELECT id FROM documents WHERE serial_number = ?", (final_serial_number,))
            # if cursor.fetchone():
            #     # Handle extremely rare collision, perhaps by trying again or returning an error
            #     return jsonify({"error": "Failed to generate a unique serial number, please try again"}), 500


        # Prepare data for insertion
        document_data = {
            'serial_number': final_serial_number,
            'name': name,
            'document_number': data.get('document_number'),
            'originating_unit': originating_unit,
            'deadline': data.get('deadline'),
            'category': data.get('category')
            # status and entry_time have defaults in DB
        }

        # Filter out None values for fields that are optional and can be NULL in DB
        # For required fields, they are already validated or should have a value.
        # 'serial_number' is now always populated (either user or generated)
        document_data_filtered = {k: v for k, v in document_data.items() if v is not None or k in ['name', 'originating_unit', 'serial_number']}

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

# Refactored personnel endpoints
@app.route('/api/personnel', methods=['GET', 'POST'])
def personnel_api():
    if request.method == 'POST':
        return _add_personnel_record()
    elif request.method == 'GET':
        return _get_all_personnel_records()

def _get_all_personnel_records():
    conn = get_db_connection()
    try:
        personnel_cursor = conn.execute("SELECT id, name, role FROM personnel ORDER BY name ASC")
        personnel_list = [dict(row) for row in personnel_cursor.fetchall()]
        return jsonify(personnel_list), 200
    except sqlite3.Error as e:
        app.logger.error(f"Database error getting all personnel: {e}")
        return jsonify({"error": "A database error occurred while fetching personnel"}), 500
    finally:
        if conn:
            conn.close()

def _add_personnel_record():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Invalid input"}), 400

    name = data.get('name')
    role = data.get('role') # Role can be None if not provided, DB should handle default or allow NULL

    if not name:
        return jsonify({"error": "Missing required field: name"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO personnel (name, role) VALUES (?, ?)", (name, role))
        conn.commit()
        personnel_id = cursor.lastrowid
        return jsonify({"message": "Personnel added successfully", "id": personnel_id}), 201
    except sqlite3.IntegrityError as e:
        conn.rollback()
        if "UNIQUE constraint failed: personnel.name" in str(e).lower(): # Made case insensitive for robustness
            return jsonify({"error": f"Personnel with name '{name}' already exists"}), 409
        # Log the specific integrity error for debugging
        app.logger.error(f"Database integrity error adding personnel: {e}")
        return jsonify({"error": f"A database integrity error occurred: {e}"}), 400
    except sqlite3.Error as e:
        conn.rollback()
        app.logger.error(f"Database error adding personnel: {e}")
        return jsonify({"error": "A database error occurred while adding personnel"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/dashboard/due_recalls', methods=['GET'])
def get_due_recalls():
    conn = get_db_connection()
    try:
        sql_query = """
            SELECT d.id, d.name, d.document_number, d.status, d.deadline,
                   fr_latest.recipient_name, fr_latest.flow_time AS sent_time, fr_latest.stage AS sent_stage
            FROM documents d
            JOIN (
                SELECT fr_inner.document_id, fr_inner.recipient_name, fr_inner.flow_time, fr_inner.stage, fr_inner.action_type
                FROM flow_records fr_inner
                INNER JOIN (
                    SELECT document_id, MAX(flow_time) AS max_flow_time
                    FROM flow_records
                    GROUP BY document_id
                ) frm_max ON fr_inner.document_id = frm_max.document_id AND fr_inner.flow_time = frm_max.max_flow_time
            ) fr_latest ON d.id = fr_latest.document_id
            WHERE d.status != 'archived' AND fr_latest.action_type = 'send'
            ORDER BY fr_latest.flow_time DESC;
        """
        # The fields from documents table are: id, name, document_number, status, deadline
        # The fields from the latest flow_record are: recipient_name, flow_time (aliased as sent_time), stage (aliased as sent_stage)

        cursor = conn.execute(sql_query)
        due_recalls_list = [dict(row) for row in cursor.fetchall()]
        return jsonify(due_recalls_list), 200
    except sqlite3.Error as e:
        app.logger.error(f"Database error getting due recalls: {e}")
        return jsonify({"error": "A database error occurred while fetching due recalls"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/dashboard/overdue_documents', methods=['GET'])
def get_overdue_documents():
    conn = get_db_connection()
    try:
        # DATE('now') in SQLite is UTC. Assuming 'deadline' is stored as YYYY-MM-DD.
        # Ensure deadline is treated as a date for comparison.
        sql_query = """
            SELECT
                id, name, document_number, status, deadline,
                CASE
                    WHEN date(deadline) < date('now') THEN 'overdue'
                    WHEN date(deadline) BETWEEN date('now') AND date('now', '+3 days') THEN 'nearing_deadline'
                    ELSE NULL -- Should not happen if WHERE clause is correct, but good for safety
                END AS urgency
            FROM documents
            WHERE
                status != 'archived'
                AND deadline IS NOT NULL
                AND deadline != ''
                AND (
                    date(deadline) < date('now')
                    OR date(deadline) BETWEEN date('now') AND date('now', '+3 days')
                )
            ORDER BY date(deadline) ASC;
        """
        # Fetched fields: id, name, document_number, status, deadline, urgency
        cursor = conn.execute(sql_query)
        documents_list = [dict(row) for row in cursor.fetchall()]
        return jsonify(documents_list), 200
    except sqlite3.Error as e:
        app.logger.error(f"Database error getting overdue documents: {e}")
        return jsonify({"error": "A database error occurred while fetching overdue documents"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/dashboard/statistics', methods=['GET'])
def get_dashboard_statistics():
    conn = get_db_connection()
    try:
        # Total pending documents
        total_pending_cursor = conn.execute("SELECT COUNT(*) AS count FROM documents WHERE status != 'archived'")
        total_pending = total_pending_cursor.fetchone()['count']

        # Documents created today
        # entry_time is DEFAULT CURRENT_TIMESTAMP, which is UTC in SQLite. DATE('now') is also UTC.
        created_today_cursor = conn.execute("SELECT COUNT(*) AS count FROM documents WHERE date(entry_time) = date('now')")
        created_today = created_today_cursor.fetchone()['count']

        # Documents completed today
        # completion_time is stored in UTC.
        completed_today_cursor = conn.execute("SELECT COUNT(*) AS count FROM documents WHERE status = 'archived' AND date(completion_time) = date('now')")
        completed_today = completed_today_cursor.fetchone()['count']

        statistics = {
            "total_pending": total_pending,
            "created_today": created_today,
            "completed_today": completed_today
        }
        return jsonify(statistics), 200

    except sqlite3.Error as e:
        app.logger.error(f"Database error getting dashboard statistics: {e}")
        return jsonify({"error": "A database error occurred while fetching dashboard statistics"}), 500
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    # Note: For development only. In production, use a WSGI server like Gunicorn.
    app.run(debug=True, port=5001)
