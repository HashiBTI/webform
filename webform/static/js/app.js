const form = document.getElementById('loanForm');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');
const documentFiles = document.getElementById('documentFiles');
const extractedTextBox = document.getElementById('extractedTextBox');

form.addEventListener('submit', async function (e) {

    e.preventDefault();

    successMessage.style.display = 'none';
    errorMessage.style.display = 'none';

    if (!form.checkValidity()) {
        errorMessage.style.display = 'block';
        form.reportValidity();
        return;
    }

    const formData = new FormData(form);
    const data = {};

    formData.forEach((value, key) => {
        data[key] = value;
    });

    data.consent = document.getElementById('consent').checked;
    data.uploadedFiles = [...documentFiles.files].map(f => f.name);
    data.extractedText = extractedTextBox.textContent || "";

    try {

        const response = await fetch('/api/save-loan-lead', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {

            successMessage.textContent = "Lead saved successfully.";
            successMessage.style.display = "block";

            form.reset();

        } else {

            errorMessage.textContent = result.message || "Failed to save lead.";
            errorMessage.style.display = "block";

        }

    } catch (error) {

        errorMessage.textContent = "Server error. Please check backend.";
        errorMessage.style.display = "block";

    }

});