document.addEventListener('DOMContentLoaded', () => {
    const fileEntryForm = document.getElementById('fileEntryForm');
    const messageArea = document.getElementById('messageArea'); // For file entry form
    const actionMessageArea = document.getElementById('actionMessageArea'); // For send/receive actions

    const documentsListArea = document.getElementById('documentsListArea');
    const flowHistoryArea = document.getElementById('flowHistoryArea');
    const refreshListButton = document.getElementById('refreshListButton');

    const sendDocumentModal = document.getElementById('sendDocumentModal');
    const sendDocumentForm = document.getElementById('sendDocumentForm');
    const sendDocumentIdInput = document.getElementById('sendDocumentId');

    const receiveDocumentModal = document.getElementById('receiveDocumentModal');
    const receiveDocumentForm = document.getElementById('receiveDocumentForm');
    const receiveDocumentIdInput = document.getElementById('receiveDocumentId');

    const searchForm = document.getElementById('searchForm');
    const clearSearchButton = document.getElementById('clearSearchButton');

    // Personnel Management Elements
    const addPersonnelForm = document.getElementById('addPersonnelForm');
    const personnelNameInput = document.getElementById('personnelName');
    const personnelRoleInput = document.getElementById('personnelRole');
    const personnelMessageArea = document.getElementById('personnelMessageArea');
    const refreshPersonnelListButton = document.getElementById('refreshPersonnelListButton');
    const personnelListArea = document.getElementById('personnelListArea');

    // Dashboard Elements
    const refreshDashboardButton = document.getElementById('refreshDashboardButton');
    const dashboardDueRecallsArea = document.getElementById('dashboardDueRecallsArea');
    const dashboardOverdueDocumentsArea = document.getElementById('dashboardOverdueDocumentsArea');
    const dashboardStatisticsArea = document.getElementById('dashboardStatisticsArea');


    // Function to display messages (used for send/receive actions and personnel)
    function showActionMessage(message, isError = false, area = actionMessageArea) {
        area.textContent = message;
        area.className = ''; // Clear previous classes like 'success' or 'error'
        // Add base class if you have one, e.g., area.classList.add('message-base-style');
        if (message) { // Only add success/error class if there's a message
            area.classList.add(isError ? 'error' : 'success');
        }
    }

    // Fetch and display all personnel
    async function fetchAndDisplayPersonnel() {
        try {
            const response = await fetch('/api/personnel');
            if (!response.ok) {
                showActionMessage(`Error fetching personnel: ${response.statusText}`, true, personnelMessageArea);
                personnelListArea.innerHTML = '<p style="color:red;">Could not load personnel.</p>';
                return;
            }
            const personnel = await response.json();
            personnelListArea.innerHTML = ''; // Clear current list

            if (personnel.length === 0) {
                personnelListArea.innerHTML = '<p>No personnel found.</p>';
                return;
            }

            const ul = document.createElement('ul');
            ul.className = 'personnel-list';
            personnel.forEach(person => {
                const li = document.createElement('li');
                li.textContent = `Name: ${person.name}, Role: ${person.role || 'N/A'}`;
                ul.appendChild(li);
            });
            personnelListArea.appendChild(ul);
            showActionMessage('', false, personnelMessageArea); // Clear any previous messages
        } catch (error) {
            console.error('Error fetching personnel:', error);
            showActionMessage('Failed to fetch personnel. See console for details.', true, personnelMessageArea);
            personnelListArea.innerHTML = '<p style="color:red;">Failed to fetch personnel.</p>';
        }
    }

    // Function to populate a dropdown with personnel
    async function populatePersonnelDropdown(selectElementId, includeBlankOption = true) {
        const selectElement = document.getElementById(selectElementId);
        if (!selectElement) {
            console.error(`Dropdown element with ID '${selectElementId}' not found.`);
            return;
        }

        try {
            const response = await fetch('/api/personnel');
            if (!response.ok) {
                console.error(`Error fetching personnel for dropdown ${selectElementId}: ${response.statusText}`);
                // Optionally, display a message in the dropdown itself or a related message area
                selectElement.innerHTML = '<option value="">Error loading personnel</option>';
                return;
            }
            const personnel = await response.json();

            selectElement.innerHTML = ''; // Clear existing options

            if (includeBlankOption) {
                const blankOption = document.createElement('option');
                blankOption.value = '';
                blankOption.textContent = '-- Select Personnel --';
                selectElement.appendChild(blankOption);
            }

            personnel.forEach(person => {
                const option = document.createElement('option');
                option.value = person.name; // Using name as value as per requirement
                option.textContent = `${person.name} (${person.role || 'N/A'})`;
                selectElement.appendChild(option);
            });

        } catch (error) {
            console.error(`Error populating personnel dropdown ${selectElementId}:`, error);
            selectElement.innerHTML = '<option value="">Failed to load personnel</option>';
        }
    }


    // Fetch and display all documents
    async function fetchAndDisplayDocuments(queryParams = {}) {
        let url = '/api/documents';
        const queryString = new URLSearchParams(queryParams).toString();
        if (queryString) {
            url += `?${queryString}`;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                showActionMessage(`Error fetching documents: ${response.statusText} (URL: ${url})`, true);
                return;
            }
            const documents = await response.json();
            documentsListArea.innerHTML = ''; // Clear current list

            if (documents.length === 0) {
                documentsListArea.innerHTML = '<p>No documents found.</p>';
                return;
            }

            const ul = document.createElement('ul');
            ul.className = 'document-list';
            documents.forEach(doc => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <strong>SN:</strong> ${doc.serial_number} <br>
                    <strong>Name:</strong> ${doc.name} <br>
                    <strong>Status:</strong> ${doc.status || 'N/A'} <br>
                    <strong>Entry:</strong> ${new Date(doc.entry_time).toLocaleString()}
                `;

                const sendButton = document.createElement('button');
                sendButton.textContent = 'Send';
                sendButton.onclick = () => {
                    sendDocumentIdInput.value = doc.id;
                    populatePersonnelDropdown('sendRecipientName');
                    populatePersonnelDropdown('sendOperatorName'); // Assumes 'sendOperatorName' will be the ID in HTML
                    sendDocumentModal.style.display = 'block';
                    receiveDocumentModal.style.display = 'none';
                    showActionMessage(''); // Clear previous messages
                };

                const receiveButton = document.createElement('button');
                receiveButton.textContent = 'Receive';
                receiveButton.onclick = () => {
                    receiveDocumentIdInput.value = doc.id;
                    populatePersonnelDropdown('receiveReturnerName');
                    populatePersonnelDropdown('receiveOperatorName'); // Assumes 'receiveOperatorName' will be the ID in HTML
                    receiveDocumentModal.style.display = 'block';
                    sendDocumentModal.style.display = 'none';
                    showActionMessage('');
                };

                const viewHistoryButton = document.createElement('button');
                viewHistoryButton.textContent = 'View History';
                viewHistoryButton.onclick = () => fetchAndDisplayFlowHistory(doc.id);

                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'doc-actions';

                // Add Send and Receive buttons only if not archived
                if (doc.status !== 'archived') {
                    actionsDiv.appendChild(sendButton);
                    actionsDiv.appendChild(receiveButton);

                    const completeButton = document.createElement('button');
                    completeButton.textContent = 'Mark Completed';
                    completeButton.className = 'complete-btn';
                    completeButton.dataset.id = doc.id; // Store doc.id in a data attribute
                    completeButton.addEventListener('click', handleCompleteDocument);
                    actionsDiv.appendChild(completeButton);
                }

                actionsDiv.appendChild(viewHistoryButton); // View history is always available
                li.appendChild(actionsDiv);
                ul.appendChild(li);
            });
            documentsListArea.appendChild(ul);
        } catch (error) {
            console.error('Error fetching documents:', error);
            showActionMessage('Failed to fetch documents. See console for details.', true);
        }
    }

    // Handler for "Mark as Completed" button clicks
    async function handleCompleteDocument(event) {
        const documentId = event.target.dataset.id;
        const completedBy = prompt("Enter your name for completion record:");

        if (!completedBy) {
            showActionMessage("Completion cancelled or no name provided.", true);
            return;
        }

        const payload = { completed_by: completedBy };
        showActionMessage(''); // Clear previous messages

        try {
            const response = await fetch(`/api/documents/${documentId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const responseData = await response.json();

            if (response.ok) {
                showActionMessage(responseData.message || "Document marked as completed!");
                fetchAndDisplayDocuments(); // Refresh the documents list
                // Optionally, refresh flow history if it's for the completed document
                // Check if flowHistoryArea has content related to this documentId before refreshing
                const displayedHistoryId = flowHistoryArea.querySelector('h3')?.textContent.match(/Document ID: (\d+)/);
                if (displayedHistoryId && displayedHistoryId[1] === documentId) {
                    fetchAndDisplayFlowHistory(documentId);
                }
            } else {
                showActionMessage(responseData.error || `Error completing document: ${response.statusText}`, true);
            }
        } catch (error) {
            console.error('Complete document error:', error);
            showActionMessage('An unexpected error occurred while completing the document. Check console.', true);
        }
    }


    // Fetch and display flow history for a document
    async function fetchAndDisplayFlowHistory(documentId) {
        flowHistoryArea.innerHTML = `Loading history for Document ID: ${documentId}...`;
        try {
            const response = await fetch(`/api/documents/${documentId}/flow`);
            if (!response.ok) {
                flowHistoryArea.innerHTML = `<p style="color:red;">Error fetching flow history: ${response.statusText}</p>`;
                return;
            }
            const flowRecords = await response.json();
            flowHistoryArea.innerHTML = ''; // Clear current history

            if (flowRecords.length === 0) {
                flowHistoryArea.innerHTML = '<p>No flow history found for this document.</p>';
                return;
            }

            const h3 = document.createElement('h3');
            h3.textContent = `Flow History for Document ID: ${documentId}`;
            flowHistoryArea.appendChild(h3);

            const ul = document.createElement('ul');
            flowRecords.forEach(record => {
                const li = document.createElement('li');
                let details = `
                    Action: ${record.action_type},
                    Operator: ${record.operator_name},
                    Time: ${new Date(record.flow_time).toLocaleString()},
                    Stage: ${record.stage}
                `;
                if (record.action_type === 'send' && record.recipient_name) {
                    details += `, Recipient: ${record.recipient_name}`;
                } else if (record.action_type === 'receive' && record.returner_name) {
                    details += `, Returner: ${record.returner_name}`;
                }
                if (record.notes) {
                    details += `, Notes: ${record.notes}`;
                }
                li.textContent = details;
                ul.appendChild(li);
            });
            flowHistoryArea.appendChild(ul);
        } catch (error) {
            console.error('Error fetching flow history:', error);
            flowHistoryArea.innerHTML = `<p style="color:red;">Failed to fetch flow history. See console for details.</p>`;
        }
    }

    // Event listener for the main file entry form
    fileEntryForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Clear previous messages and classes at the beginning
        messageArea.textContent = '';
        messageArea.className = '';

        const serial_number_input = document.getElementById('serial_number').value.trim(); // User input for SN
        const name = document.getElementById('name').value.trim();
        const document_number = document.getElementById('document_number').value.trim();
        const originating_unit = document.getElementById('originating_unit').value.trim();
        const deadline = document.getElementById('deadline').value;
        const category = document.getElementById('category').value;

        // Updated validation: Only Name and Originating Unit are strictly required from the user.
        // Serial number is optional for user input; backend will generate if not provided.
        if (!name || !originating_unit) {
            messageArea.textContent = 'Please fill in all required fields: Name and Originating Unit.';
            messageArea.classList.add('error'); // Add error class
            return;
        }

        const formData = {
            // Send serial_number_input; backend handles empty string for auto-generation
            serial_number: serial_number_input,
            name,
            originating_unit,
            category,
            document_number: document_number || null, // Send null if empty
            deadline: deadline || null, // Send null if empty
        };

        // messageArea.textContent = ''; // Already cleared at the top
        // messageArea.className = ''; // Already cleared at the top

        try {
            const response = await fetch('/api/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const responseData = await response.json();
            if (response.status === 201) {
                messageArea.textContent = `Success: ${responseData.message} (ID: ${responseData.id})`;
                messageArea.classList.add('success');
                fileEntryForm.reset();
                fetchAndDisplayDocuments(); // Refresh the list
            } else {
                messageArea.textContent = `Error: ${responseData.error || response.statusText}`;
                messageArea.classList.add('error');
            }
        } catch (error) {
            console.error('File entry fetch error:', error);
            messageArea.textContent = 'An unexpected error occurred during file entry. Check console.';
            messageArea.classList.add('error');
        }
    });

    // Event listener for "Refresh List" button
    refreshListButton.addEventListener('click', () => {
        searchForm.reset(); // Also clear search form on manual refresh
        fetchAndDisplayDocuments();
        flowHistoryArea.innerHTML = ''; // Clear history view
    });

    // Event listener for search form submission
    searchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const params = {};
        const nameKeyword = document.getElementById('search_name_keyword').value;
        if (nameKeyword) params.name_keyword = nameKeyword;

        const docNumber = document.getElementById('search_document_number').value;
        if (docNumber) params.document_number = docNumber;

        const originatingUnit = document.getElementById('search_originating_unit').value;
        if (originatingUnit) params.originating_unit = originatingUnit;

        const category = document.getElementById('search_category').value;
        if (category) params.category = category;

        const entryDateFrom = document.getElementById('search_entry_date_from').value;
        if (entryDateFrom) params.entry_date_from = entryDateFrom;

        const entryDateTo = document.getElementById('search_entry_date_to').value;
        if (entryDateTo) params.entry_date_to = entryDateTo;

        const status = document.getElementById('search_status').value;
        if (status) params.status = status;

        fetchAndDisplayDocuments(params);
        flowHistoryArea.innerHTML = ''; // Clear history view as context changed
    });

    // Event listener for "Clear Search" button
    clearSearchButton.addEventListener('click', ()_=> {
        searchForm.reset();
        fetchAndDisplayDocuments({}); // Fetch all documents
        flowHistoryArea.innerHTML = ''; // Clear history view
    });

    // Event listener for "Send Document" form submission
    sendDocumentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const document_id = sendDocumentIdInput.value;
        // Values will be read from select elements once HTML is updated
        const recipient_name = document.getElementById('sendRecipientName').value;
        const sender_name = document.getElementById('sendOperatorName').value; // Will be 'sendOperatorName'
        const stage = document.getElementById('sendStage').value;
        const notes = document.getElementById('sendNotes').value;

        if (!recipient_name || !stage || !sender_name) {
            showActionMessage("Recipient, Operator, and Stage are required for sending.", true);
            return;
        }

        const payload = { recipient_name, stage, notes, sender_name };

        try {
            const response = await fetch(`/api/documents/${document_id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const responseData = await response.json();
            if (response.ok) {
                showActionMessage(responseData.message || "Document sent successfully!");
                sendDocumentModal.style.display = 'none';
                sendDocumentForm.reset();
                fetchAndDisplayDocuments(); // Refresh list
                fetchAndDisplayFlowHistory(document_id); // Refresh history if this doc was viewed
            } else {
                showActionMessage(responseData.error || `Error sending document: ${response.statusText}`, true);
            }
        } catch (error) {
            console.error('Send document error:', error);
            showActionMessage('An unexpected error occurred while sending. Check console.', true);
        }
    });

    // Event listener for "Receive Document" form submission
    receiveDocumentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const document_id = receiveDocumentIdInput.value;
        // Values will be read from select elements once HTML is updated
        const returner_name = document.getElementById('receiveReturnerName').value;
        const receiver_name = document.getElementById('receiveOperatorName').value; // Will be 'receiveOperatorName'
        const stage = document.getElementById('receiveStage').value;
        const notes = document.getElementById('receiveNotes').value;


        if (!returner_name || !stage || !receiver_name) {
            showActionMessage("Returner, Operator, and Stage are required for receiving.", true);
            return;
        }

        const payload = { returner_name, stage, notes, receiver_name };

        try {
            const response = await fetch(`/api/documents/${document_id}/receive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const responseData = await response.json();
            if (response.ok) {
                showActionMessage(responseData.message || "Document received successfully!");
                receiveDocumentModal.style.display = 'none';
                receiveDocumentForm.reset();
                fetchAndDisplayDocuments(); // Refresh list
                fetchAndDisplayFlowHistory(document_id); // Refresh history
            } else {
                showActionMessage(responseData.error || `Error receiving document: ${response.statusText}`, true);
            }
        } catch (error) {
            console.error('Receive document error:', error);
            showActionMessage('An unexpected error occurred while receiving. Check console.', true);
        }
    });


    // Initial load of documents
    fetchAndDisplayDocuments({}); // Pass empty object for initial load
    fetchAndDisplayPersonnel(); // Initial load of personnel
    loadDashboardData(); // Initial load of dashboard data


    // Dashboard Functions
    async function fetchAndDisplayStatistics() {
        if (!dashboardStatisticsArea) return;
        dashboardStatisticsArea.innerHTML = 'Loading statistics...';
        try {
            const response = await fetch('/api/dashboard/statistics');
            if (!response.ok) {
                dashboardStatisticsArea.textContent = `Error: ${response.statusText}`;
                return;
            }
            const stats = await response.json();
            dashboardStatisticsArea.innerHTML = `
                <p>Total Pending Documents: <strong>${stats.total_pending}</strong></p>
                <p>Documents Created Today: <strong>${stats.created_today}</strong></p>
                <p>Documents Completed Today: <strong>${stats.completed_today}</strong></p>
            `;
        } catch (error) {
            console.error('Error fetching statistics:', error);
            dashboardStatisticsArea.textContent = 'Failed to load statistics.';
        }
    }

    async function fetchAndDisplayDueRecalls() {
        if (!dashboardDueRecallsArea) return;
        dashboardDueRecallsArea.innerHTML = 'Loading due recalls...';
        try {
            const response = await fetch('/api/dashboard/due_recalls');
            if (!response.ok) {
                dashboardDueRecallsArea.textContent = `Error: ${response.statusText}`;
                return;
            }
            const documents = await response.json();
            if (documents.length === 0) {
                dashboardDueRecallsArea.innerHTML = '<p>No documents currently pending recall.</p>';
                return;
            }
            const ul = document.createElement('ul');
            documents.forEach(doc => {
                const li = document.createElement('li');
                let deadlineInfo = 'N/A';
                if (doc.deadline) {
                    const deadlineDate = new Date(doc.deadline + 'T00:00:00'); // Ensure deadline is treated as date
                    const isOverdue = deadlineDate < new Date(new Date().toDateString()); // Compare date parts only
                    deadlineInfo = `${deadlineDate.toLocaleDateString()} ${isOverdue ? '<strong style="color:red;">(OVERDUE)</strong>' : ''}`;
                }

                li.innerHTML = `
                    <strong>${doc.name}</strong> (SN: ${doc.serial_number || 'N/A'}, DocNo: ${doc.document_number || 'N/A'})<br>
                    Sent To: ${doc.recipient_name} (Stage: ${doc.sent_stage})<br>
                    Sent Time: ${new Date(doc.sent_time).toLocaleString()}<br>
                    Original Deadline: ${deadlineInfo}<br>
                    Current Status: ${doc.status}
                `;
                ul.appendChild(li);
            });
            dashboardDueRecallsArea.innerHTML = ''; // Clear loading message
            dashboardDueRecallsArea.appendChild(ul);
        } catch (error) {
            console.error('Error fetching due recalls:', error);
            dashboardDueRecallsArea.textContent = 'Failed to load due recalls.';
        }
    }

    async function fetchAndDisplayOverdueDocuments() {
        if (!dashboardOverdueDocumentsArea) return;
        dashboardOverdueDocumentsArea.innerHTML = 'Loading overdue documents...';
        try {
            const response = await fetch('/api/dashboard/overdue_documents');
            if (!response.ok) {
                dashboardOverdueDocumentsArea.textContent = `Error: ${response.statusText}`;
                return;
            }
            const documents = await response.json();
            if (documents.length === 0) {
                dashboardOverdueDocumentsArea.innerHTML = '<p>No documents are currently overdue or nearing deadline.</p>';
                return;
            }
            const ul = document.createElement('ul');
            documents.forEach(doc => {
                const li = document.createElement('li');
                let urgencyStyle = '';
                if (doc.urgency === 'overdue') {
                    urgencyStyle = 'color: red; font-weight: bold;';
                } else if (doc.urgency === 'nearing_deadline') {
                    urgencyStyle = 'color: orange;';
                }
                li.innerHTML = `
                    <strong>${doc.name}</strong> (SN: ${doc.serial_number || 'N/A'}, DocNo: ${doc.document_number || 'N/A'})<br>
                    Deadline: ${new Date(doc.deadline + 'T00:00:00').toLocaleDateString()}<br>
                    Urgency: <span style="${urgencyStyle}">${doc.urgency.replace('_', ' ')}</span><br>
                    Current Status: ${doc.status}
                `;
                ul.appendChild(li);
            });
            dashboardOverdueDocumentsArea.innerHTML = ''; // Clear loading message
            dashboardOverdueDocumentsArea.appendChild(ul);
        } catch (error) {
            console.error('Error fetching overdue documents:', error);
            dashboardOverdueDocumentsArea.textContent = 'Failed to load overdue documents.';
        }
    }

    function loadDashboardData() {
        fetchAndDisplayStatistics();
        fetchAndDisplayDueRecalls();
        fetchAndDisplayOverdueDocuments();
    }

    if(refreshDashboardButton) {
        refreshDashboardButton.addEventListener('click', loadDashboardData);
    }

    // Event listener for "Add Personnel" form
    if (addPersonnelForm) {
        addPersonnelForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const name = personnelNameInput.value.trim();
            const role = personnelRoleInput.value.trim();

            if (!name) {
                // showActionMessage handles personnelMessageArea directly if 'area' param is used
                showActionMessage('Personnel name is required.', true, personnelMessageArea);
                return;
            }

            const payload = { name, role };
            showActionMessage('Adding personnel...', false, personnelMessageArea); // Show neutral message

            try {
                const response = await fetch('/api/personnel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const responseData = await response.json();

                if (response.ok) { // Status 201 or similar
                    showActionMessage(responseData.message || 'Personnel added successfully!', false, personnelMessageArea);
                    addPersonnelForm.reset();
                    fetchAndDisplayPersonnel(); // Refresh the list
                } else {
                    showActionMessage(responseData.error || `Error adding personnel: ${response.statusText}`, true, personnelMessageArea);
                }
            } catch (error) {
                console.error('Add personnel error:', error);
                showActionMessage('An unexpected error occurred while adding personnel. Check console.', true, personnelMessageArea);
            }
        });
    }

    // Event listener for "Refresh Personnel List" button
    if (refreshPersonnelListButton) {
        refreshPersonnelListButton.addEventListener('click', fetchAndDisplayPersonnel);
    }

});
