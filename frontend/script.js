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

    // Function to display messages (used for send/receive actions)
    function showActionMessage(message, isError = false) {
        actionMessageArea.textContent = message;
        actionMessageArea.style.color = isError ? 'red' : 'green';
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
                    sendDocumentModal.style.display = 'block';
                    receiveDocumentModal.style.display = 'none';
                    showActionMessage(''); // Clear previous messages
                };

                const receiveButton = document.createElement('button');
                receiveButton.textContent = 'Receive';
                receiveButton.onclick = () => {
                    receiveDocumentIdInput.value = doc.id;
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

        const serial_number = document.getElementById('serial_number').value;
        const name = document.getElementById('name').value;
        const document_number = document.getElementById('document_number').value;
        const originating_unit = document.getElementById('originating_unit').value;
        const deadline = document.getElementById('deadline').value;
        const category = document.getElementById('category').value;

        if (!serial_number || !name || !originating_unit) {
            messageArea.textContent = 'Please fill in all required fields: Serial Number, Name, and Originating Unit.';
            messageArea.style.color = 'red';
            return;
        }

        const formData = {
            serial_number, name, originating_unit, category,
            document_number: document_number || null,
            deadline: deadline || null,
        };

        messageArea.textContent = ''; messageArea.style.color = 'black';

        try {
            const response = await fetch('/api/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const responseData = await response.json();
            if (response.status === 201) {
                messageArea.textContent = `Success: ${responseData.message} (ID: ${responseData.id})`;
                messageArea.style.color = 'green';
                fileEntryForm.reset();
                fetchAndDisplayDocuments(); // Refresh the list
            } else {
                messageArea.textContent = `Error: ${responseData.error || response.statusText}`;
                messageArea.style.color = 'red';
            }
        } catch (error) {
            console.error('File entry fetch error:', error);
            messageArea.textContent = 'An unexpected error occurred during file entry. Check console.';
            messageArea.style.color = 'red';
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
        const recipient_name = document.getElementById('sendRecipientName').value;
        const stage = document.getElementById('sendStage').value;
        const notes = document.getElementById('sendNotes').value;
        const sender_name = "WebAppUser"; // Hardcoded as per requirement

        if (!recipient_name || !stage) {
            showActionMessage("Recipient Name and Stage are required for sending.", true);
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
        const returner_name = document.getElementById('receiveReturnerName').value;
        const stage = document.getElementById('receiveStage').value;
        const notes = document.getElementById('receiveNotes').value;
        const receiver_name = "WebAppUser"; // Hardcoded as per requirement

        if (!returner_name || !stage) {
            showActionMessage("Returner Name and Stage are required for receiving.", true);
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
});
