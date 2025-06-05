-- documents table
CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number TEXT UNIQUE,
    name TEXT NOT NULL,
    document_number TEXT,
    originating_unit TEXT NOT NULL,
    deadline DATE,
    category TEXT CHECK(category IN ('A', 'B')),
    entry_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending_processing', -- e.g., 'pending_processing', 'in_progress', 'completed', 'archived'
    completed_by TEXT, -- Personnel ID or name
    completion_time DATETIME
);

-- flow_records table
CREATE TABLE flow_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER,
    action_type TEXT CHECK(action_type IN ('send', 'receive')),
    operator_name TEXT NOT NULL, -- Name of the person sending or receiving
    recipient_name TEXT, -- Name of the person receiving (if action_type is 'send')
    returner_name TEXT, -- Name of the person returning (if action_type is 'receive')
    flow_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    stage TEXT, -- e.g., 'distribution', 'approval'
    FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- personnel table
CREATE TABLE personnel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    role TEXT -- e.g., 'staff', 'manager', 'director'
);
