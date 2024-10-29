function bold(text) {
    // Replace double asterisks with <strong> tags for bold text
    var boldPattern = /\*\*(.*?)\*\*/gm;
    var html = text.replace(boldPattern, '<strong>$1</strong>');

    // Replace line breaks with <br> to preserve the formatting
    return html.replace(/(\r\n|\n|\r)/g, '<br>');
}

document.getElementById("myForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const query = document.getElementById("query").value;
    displayMessage(query, "user-message");

    // Send the query to the server
    fetch("/chatbot", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ query: query }),
    })
    .then((response) => response.text()) // Get response as plain text
    .then((data) => {
        // Display the server's response in the chat
        console.log(data);
        var result = bold(data);
        displayMessage(result, "bot-message");
    })
    .catch((error) => {
        console.error("Error:", error);
        displayMessage("Sorry, there was an error processing your request.", "bot-message");
    });

    document.getElementById("query").value = ""; // Clear input field
});

function displayMessage(message, className) {
    const chatContainer = document.getElementById("chat-container");
    const messageBubble = document.createElement("div");
    messageBubble.className = `chat-bubble ${className}`;
    messageBubble.innerHTML = message; // Use innerHTML to render HTML
    chatContainer.appendChild(messageBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight; // Scroll to the bottom
}
