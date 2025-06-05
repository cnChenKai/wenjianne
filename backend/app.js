const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database(path.join(__dirname, '../database/file_flow.db'));

app.use(cors());
app.use(express.json());

// Helper function to get a document by ID
function getDocument(documentId) {
    return db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
}

// Create and get documents
app.route('/api/documents')
    .post((req, res) => {
        const data = req.body;

        if (!data.name || !data.originating_unit || !data.serial_number) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        try {
            // Check for serial_number uniqueness
            const existing = db.prepare('SELECT id FROM documents WHERE serial_number = ?').get(data.serial_number);
            if (existing) {
                return res.status(409).json({ error: `Serial number '${data.serial_number}' already exists` });
            }

            const stmt = db.prepare(`
                INSERT INTO documents (
                    serial_number, name, document_number, originating_unit, 
                    deadline, category
                ) VALUES (?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
                data.serial_number,
                data.name,
                data.document_number || null,
                data.originating_unit,
                data.deadline || null,
                data.category || null
            );

            res.status(201).json({
                message: "Document created successfully",
                id: result.lastInsertRowid
            });
        } catch (error) {
            console.error('Database error:', error);
            res.status(500).json({ error: "A database error occurred" });
        }
    })
    .get((req, res) => {
        try {
            let query = 'SELECT * FROM documents WHERE 1=1';
            const params = [];

            if (req.query.name_keyword) {
                query += ' AND name LIKE ?';
                params.push(`%${req.query.name_keyword}%`);
            }
            if (req.query.document_number) {
                query += ' AND document_number LIKE ?';
                params.push(`%${req.query.document_number}%`);
            }
            if (req.query.originating_unit) {
                query += ' AND originating_unit LIKE ?';
                params.push(`%${req.query.originating_unit}%`);
            }
            if (req.query.category) {
                query += ' AND category = ?';
                params.push(req.query.category);
            }
            if (req.query.entry_date_from) {
                query += ' AND date(entry_time) >= ?';
                params.push(req.query.entry_date_from);
            }
            if (req.query.entry_date_to) {
                query += ' AND date(entry_time) <= ?';
                params.push(req.query.entry_date_to);
            }
            if (req.query.status) {
                query += ' AND status = ?';
                params.push(req.query.status);
            }

            query += ' ORDER BY entry_time DESC';

            const stmt = db.prepare(query);
            const documents = stmt.all(...params);
            res.json(documents);
        } catch (error) {
            console.error('Database error:', error);
            res.status(500).json({ error: "A database error occurred" });
        }
    });

// Get document flow history
app.get('/api/documents/:id/flow', (req, res) => {
    try {
        const document = getDocument(req.params.id);
        if (!document) {
            return res.status(404).json({ error: "Document not found" });
        }

        const stmt = db.prepare(`
            SELECT * FROM flow_records 
            WHERE document_id = ? 
            ORDER BY flow_time ASC
        `);
        const flowRecords = stmt.all(req.params.id);
        res.json(flowRecords);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: "A database error occurred" });
    }
});

// Send document
app.post('/api/documents/:id/send', (req, res) => {
    const { recipient_name, stage, sender_name, notes } = req.body;

    if (!recipient_name || !stage || !sender_name) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const document = getDocument(req.params.id);
        if (!document) {
            return res.status(404).json({ error: "Document not found" });
        }

        db.transaction(() => {
            const flowStmt = db.prepare(`
                INSERT INTO flow_records (
                    document_id, action_type, operator_name, 
                    recipient_name, stage, notes
                ) VALUES (?, 'send', ?, ?, ?, ?)
            `);
            const flowResult = flowStmt.run(
                req.params.id, sender_name, recipient_name, stage, notes
            );

            const statusStmt = db.prepare(`
                UPDATE documents 
                SET status = ? 
                WHERE id = ?
            `);
            statusStmt.run(`Sent to ${recipient_name} at stage ${stage}`, req.params.id);

            return flowResult.lastInsertRowid;
        })();

        res.json({ message: "Document sent successfully" });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: "A database error occurred" });
    }
});

// Receive document
app.post('/api/documents/:id/receive', (req, res) => {
    const { returner_name, stage, receiver_name, notes } = req.body;

    if (!returner_name || !stage || !receiver_name) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const document = getDocument(req.params.id);
        if (!document) {
            return res.status(404).json({ error: "Document not found" });
        }

        db.transaction(() => {
            const flowStmt = db.prepare(`
                INSERT INTO flow_records (
                    document_id, action_type, operator_name, 
                    returner_name, stage, notes
                ) VALUES (?, 'receive', ?, ?, ?, ?)
            `);
            const flowResult = flowStmt.run(
                req.params.id, receiver_name, returner_name, stage, notes
            );

            const statusStmt = db.prepare(`
                UPDATE documents 
                SET status = ? 
                WHERE id = ?
            `);
            statusStmt.run(`Received from ${returner_name} at stage ${stage}`, req.params.id);

            return flowResult.lastInsertRowid;
        })();

        res.json({ message: "Document received successfully" });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: "A database error occurred" });
    }
});

// Complete document
app.post('/api/documents/:id/complete', (req, res) => {
    const { completed_by } = req.body;

    if (!completed_by) {
        return res.status(400).json({ error: "Missing required field: completed_by" });
    }

    try {
        const document = getDocument(req.params.id);
        if (!document) {
            return res.status(404).json({ error: "Document not found" });
        }

        if (document.status === 'archived') {
            return res.status(409).json({
                message: "Document is already archived",
                document
            });
        }

        const stmt = db.prepare(`
            UPDATE documents
            SET status = 'archived',
                completed_by = ?,
                completion_time = datetime('now')
            WHERE id = ?
        `);
        stmt.run(completed_by, req.params.id);

        const updatedDocument = getDocument(req.params.id);
        res.json({
            message: "Document marked as completed and archived",
            document: updatedDocument
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: "A database error occurred" });
    }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});