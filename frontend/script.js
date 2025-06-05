document.addEventListener('DOMContentLoaded', () => {
    const fileEntryForm = document.getElementById('fileEntryForm');
    const messageArea = document.getElementById('messageArea');
    const actionMessageArea = document.getElementById('actionMessageArea');
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

    // Loading indicator function
    function showLoading(element) {
        const loader = document.createElement('div');
        loader.className = 'loading';
        element.appendChild(loader);
        return loader;
    }

    function showMessage(element, message, isError = false) {
        element.textContent = message;
        element.className = isError ? 'error' : 'success';
        element.style.display = 'block';
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }

    function showActionMessage(message, isError = false) {
        showMessage(actionMessageArea, message, isError);
    }

    async function fetchAndDisplayDocuments(queryParams = {}) {
        const loader = showLoading(documentsListArea);
        documentsListArea.innerHTML = '';

        let url = '/api/documents';
        const queryString = new URLSearchParams(queryParams).toString();
        if (queryString) {
            url += `?${queryString}`;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`${response.status}: ${response.statusText}`);
            }
            const documents = await response.json();

            documentsListArea.innerHTML = '';
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

                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'doc-actions';

                if (doc.status !== 'archived') {
                    const sendButton = document.createElement('button');
                    sendButton.textContent = 'Send';
                    sendButton.onclick = () => {
                        sendDocumentIdInput.value = doc.id;
                        sendDocumentModal.style.display = 'block';
                        receiveDocumentModal.style.display = 'none';
                        showActionMessage('');
                    };
                    actionsDiv.appendChild(sendButton);

                    const receiveButton = document.createElement('button');
                    receiveButton.textContent = 'Receive';
                    receiveButton.onclick = () => {
                        receiveDocumentIdInput.value = doc.id;
                        receiveDocumentModal.style.display = 'block';
                        sendDocumentModal.style.display = 'none';
                        showActionMessage('');
                    };
                    actionsDiv.appendChild(receiveButton);

                    const completeButton = document.createElement('button');
                    completeButton.textContent = 'Mark Completed';
                    completeButton.className = 'complete-btn';
                    completeButton.dataset.id = doc.id;
                    completeButton.addEventListener('click', handleCompleteDocument);
                    actionsDiv.appendChild(completeButton);
                }

                const viewHistoryButton = document.createElement('button');
                viewHistoryButton.textContent = 'View History';
                viewHistoryButton.onclick = () => fetchAndDisplayFlowHistory(doc.id);
                actionsDiv.appendChild(viewHistoryButton);

                li.appendChild(actionsDiv);
                ul.appendChild(li);
            });
            documentsListArea.appendChild(ul);
        } catch (error) {
            console.error('Error fetching documents:', error);
            showActionMessage(`Failed to fetch documents: ${error.message}`, true);
        } finally {
            loader.remove();
        }
    }

    async function handleCompleteDocument(event) {
        const documentId = event.target.dataset.id;
        const completedBy = prompt("Enter your name for completion record:");

        if (!completedBy) {
            showActionMessage("Completion cancelled or no name provided.", true);
            return;
        }

        const payload = { completed_by: completedBy };
        showActionMessage('');

        try {
            const response = await fetch(`/api/documents/${documentId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const responseData = await response.json();

            if (response.ok) {
                showActionMessage(responseData.message || "Document marked as completed!");
                fetchAndDisplayDocuments();
                const displayedHistoryId = flowHistoryArea.querySelector('h3')?.textContent.match(/Document ID: (\d+)/);
                if (displayedHistoryId && displayedHistoryId[1] === documentId) {
                    fetchAndDisplayFlowHistory(documentId);
                }
            } else {
                throw new Error(responseData.error || response.statusText);
            }
        } catch (error) {
            console.error('Complete document error:', error);
            showActionMessage(`Error completing document: ${error.message}`, true);
        }
    }

    async function fetchAndDisplayFlowHistory(documentId) {
        const loader = showLoading(flowHistoryArea);
        flowHistoryArea.innerHTML = '';

        try {
            const response = await fetch(`/api/documents/${documentId}/flow`);
            if (!response.ok) {
                throw new Error(`${response.status}: ${response.statusText}`);
            }
            const flowRecords = await response.json();

            flowHistoryArea.innerHTML = '';
            const h3 = document.createElement('h3');
            h3.textContent = `Flow History for Document ID: ${documentId}`;
            flowHistoryArea.appendChild(h3);

            if (flowRecords.length === 0) {
                flowHistoryArea.innerHTML += '<p>No flow history found for this document.</p>';
                return;
            }

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
            flowHistoryArea.innerHTML = `<p class="error">Failed to fetch flow history: ${error.message}</p>`;
        } finally {
            loader.remove();
        }
    }

    fileEntryForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = {
            serial_number: document.getElementById('serial_number').value,
            name: document.getElementById('name').value,
            document_number: document.getElementById('document_number').value || null,
            originating_unit: document.getElementById('originating_unit').value,
            deadline: document.getElementById('deadline').value || null,
            category: document.getElementById('category').value
        };

        if (!formData.serial_number || !formData.name || !formData.originating_unit) {
            showMessage(messageArea, 'Please fill in all required fields: Serial Number, Name, and Originating Unit.', true);
            return;
        }

        const submitButton = event.target.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';

        try {
            const response = await fetch('/api/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const responseData = await response.json();

            if (response.status === 201) {
                showMessage(messageArea, `Success: ${responseData.message} (ID: ${responseData.id})`);
                fileEntryForm.reset();
                fetchAndDisplayDocuments();
            } else {
                throw new Error(responseData.error || response.statusText);
            }
        } catch (error) {
            console.error('File entry error:', error);
            showMessage(messageArea, `Error: ${error.message}`, true);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        }
    });

    refreshListButton.addEventListener('click', () => {
        searchForm.reset();
        fetchAndDisplayDocuments();
        flowHistoryArea.innerHTML = '';
    });

    searchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const params = {};
        ['name_keyword', 'document_number', 'originating_unit', 'category', 
         'entry_date_from', 'entry_date_to', 'status'].forEach(field => {
            const value = document.getElementById(`search_${field}`).value;
            if (value) params[field] = value;
        });
        fetchAndDisplayDocuments(params);
        flowHistoryArea.innerHTML = '';
    });

    clearSearchButton.addEventListener('click', () => {
        searchForm.reset();
        fetchAndDisplayDocuments();
        flowHistoryArea.innerHTML = '';
    });

    sendDocumentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const document_id = sendDocumentIdInput.value;
        const recipient_name = document.getElementById('sendRecipientName').value;
        const stage = document.getElementById('sendStage').value;
        const notes = document.getElementById('sendNotes').value;
        const sender_name = "WebAppUser";

        if (!recipient_name || !stage) {
            showActionMessage("Recipient Name and Stage are required for sending.", true);
            return;
        }

        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
            const response = await fetch(`/api/documents/${document_id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipient_name, stage, notes, sender_name }),
            });
            const responseData = await response.json();

            if (response.ok) {
                showActionMessage(responseData.message || "Document sent successfully!");
                sendDocumentModal.style.display = 'none';
                sendDocumentForm.reset();
                fetchAndDisplayDocuments();
                fetchAndDisplayFlowHistory(document_id);
            } else {
                throw new Error(responseData.error || response.statusText);
            }
        } catch (error) {
            console.error('Send document error:', error);
            showActionMessage(`Error sending document: ${error.message}`, true);
        } finally {
            submitButton.disabled = false;
        }
    });

    receiveDocumentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const document_id = receiveDocumentIdInput.value;
        const returner_name = document.getElementById('receiveReturnerName').value;
        const stage = document.getElementById('receiveStage').value;
        const notes = document.getElementById('receiveNotes').value;
        const receiver_name = "WebAppUser";

        if (!returner_name || !stage) {
            showActionMessage("Returner Name and Stage are required for receiving.", true);
            return;
        }

        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
            const response = await fetch(`/api/documents/${document_id}/receive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returner_name, stage, notes, receiver_name }),
            });
            const responseData = await response.json();

            if (response.ok) {
                showActionMessage(responseData.message || "Document received successfully!");
                receiveDocumentModal.style.display = 'none';
                receiveDocumentForm.reset();
                fetchAndDisplayDocuments();
                fetchAndDisplayFlowHistory(document_id);
            } else {
                throw new Error(responseData.error || response.statusText);
            }
        } catch (error) {
            console.error('Receive document error:', error);
            showActionMessage(`Error receiving document: ${error.message}`, true);
        } finally {
            submitButton.disabled = false;
        }
    });

    // Initial load of documents
    fetchAndDisplayDocuments();
});