/* =============================================================
   chatbot.js  —  FloodBot frontend
   Works with the streaming + history backend from aiService.js
   ============================================================= */

// ── State ──────────────────────────────────────────────────────
let currentConversationId = null;  // tracks the active conversation
let isStreaming = false;           // prevents double-submits

// ── DOM refs ───────────────────────────────────────────────────
const form          = document.getElementById("myForm");
const queryInput    = document.getElementById("query");
const chatContainer = document.getElementById("chatContainer");
const emptyState    = document.getElementById("emptyState");
const typingInd     = document.getElementById("typingIndicator");
const sendBtn       = document.getElementById("sendBtn");
const convList      = document.getElementById("convList");
const newChatBtn    = document.getElementById("newChatBtn");
const sidebar       = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");

// ── Auto-resize textarea as user types ────────────────────────
queryInput.addEventListener("input", () => {
  queryInput.style.height = "auto";
  queryInput.style.height = Math.min(queryInput.scrollHeight, 160) + "px";
});

// Submit on Enter (Shift+Enter = newline)
queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

// ── Sidebar toggle ─────────────────────────────────────────────
sidebarToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

// ── New conversation ───────────────────────────────────────────
newChatBtn.addEventListener("click", () => {
  currentConversationId = null;
  chatContainer.innerHTML = "";
  showEmptyState(true);
  sidebar.classList.remove("open");
});

// ── Suggestion chips ───────────────────────────────────────────
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    queryInput.value = chip.dataset.q;
    form.requestSubmit();
  });
});

// ── Form submit ────────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isStreaming) return;

  const query = queryInput.value.trim();
  if (!query) return;

  queryInput.value = "";
  queryInput.style.height = "auto";

  showEmptyState(false);
  appendMessage(query, "user");
  setStreaming(true);

  try {
    await streamResponse(query);
  } catch (err) {
    appendErrorMessage("Connection lost. Please try again.");
    console.error("[FloodBot] Stream error:", err);
  } finally {
    setStreaming(false);
  }
});

// ── Core: stream response from /api/chat/stream ────────────────
async function streamResponse(query) {
  showTyping(true);

  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      conversationId: currentConversationId,
    }),
  });

  if (!res.ok) {
    showTyping(false);
    const err = await res.json().catch(() => ({}));
    appendErrorMessage(err.error || "Something went wrong. Please try again.");
    return;
  }

  showTyping(false);

  // Create the bot bubble early — we'll fill it as chunks arrive
  const bubble = createBotBubble();
  let rawText = "";

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE lines are separated by double newlines
    const parts = buffer.split("\n\n");
    buffer = parts.pop(); // keep incomplete chunk

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;

      let payload;
      try {
        payload = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      if (payload.error) {
        renderBubbleError(bubble, payload.error);
        return;
      }

      if (payload.chunk) {
        rawText += payload.chunk;
        // Show raw text while streaming so the user sees progress
        bubble.querySelector(".bubble-body").textContent = rawText;
        scrollToBottom();
      }

      if (payload.done) {
        // Full response received — render the structured JSON nicely
        renderStructuredResponse(bubble, rawText);
        loadConversationList(); // refresh sidebar
      }
    }
  }
}

// ── Render the final structured JSON response ──────────────────
function renderStructuredResponse(bubble, rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Gemini returned plain text (shouldn't happen with our prompt, but safe fallback)
    bubble.querySelector(".bubble-body").innerHTML = formatPlainText(rawText);
    return;
  }

  // Handle error responses from Gemini (out-of-scope questions)
  if (parsed.error) {
    renderBubbleError(bubble, parsed.error);
    return;
  }

  const body = bubble.querySelector(".bubble-body");
  body.innerHTML = ""; // clear the streaming text

  // Urgency badge
  if (parsed.urgency) {
    const badge = document.createElement("span");
    badge.className = `urgency-badge urgency-${parsed.urgency}`;
    badge.textContent = parsed.urgency.charAt(0).toUpperCase() + parsed.urgency.slice(1) + " priority";
    body.appendChild(badge);
  }

  // Summary
  if (parsed.summary) {
    const summary = document.createElement("p");
    summary.className = "response-summary";
    summary.textContent = parsed.summary;
    body.appendChild(summary);
  }

  // Steps
  if (parsed.steps && parsed.steps.length > 0) {
    const ol = document.createElement("ol");
    ol.className = "response-steps";
    parsed.steps.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      ol.appendChild(li);
    });
    body.appendChild(ol);
  }

  // Warning
  if (parsed.warning) {
    const warn = document.createElement("div");
    warn.className = "response-warning";
    warn.innerHTML = `<strong>⚠ Safety note:</strong> ${parsed.warning}`;
    body.appendChild(warn);
  }

  // Follow-up chips
  if (parsed.followUp && parsed.followUp.length > 0) {
    const chipRow = document.createElement("div");
    chipRow.className = "followup-chips";
    parsed.followUp.forEach((q) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.textContent = q;
      btn.addEventListener("click", () => {
        queryInput.value = q;
        form.requestSubmit();
      });
      chipRow.appendChild(btn);
    });
    body.appendChild(chipRow);
  }

  scrollToBottom();
}

// ── Conversation history sidebar ───────────────────────────────
async function loadConversationList() {
  try {
    const res = await fetch("/api/chat/history");
    if (!res.ok) return;
    const { conversations } = await res.json();

    convList.innerHTML = "";

    if (!conversations || conversations.length === 0) {
      convList.innerHTML = '<li class="conv-empty">No conversations yet</li>';
      return;
    }

    conversations.forEach((conv) => {
      const li = document.createElement("li");
      li.className = "conv-item" + (conv._id === currentConversationId ? " active" : "");
      li.dataset.id = conv._id;

      const title = document.createElement("span");
      title.className = "conv-title";
      title.textContent = conv.title || "Conversation";

      const del = document.createElement("button");
      del.className = "conv-delete";
      del.title = "Delete";
      del.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>`;
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteConversation(conv._id, li);
      });

      li.appendChild(title);
      li.appendChild(del);
      li.addEventListener("click", () => openConversation(conv._id));
      convList.appendChild(li);
    });
  } catch (err) {
    console.error("[FloodBot] Failed to load history:", err);
  }
}

async function openConversation(id) {
  currentConversationId = id;
  sidebar.classList.remove("open");

  try {
    const res = await fetch(`/api/chat/history/${id}`);
    if (!res.ok) return;
    const { conversation } = await res.json();

    chatContainer.innerHTML = "";
    showEmptyState(false);

    conversation.messages.forEach((msg) => {
      if (msg.role === "user") {
        appendMessage(msg.text, "user");
      } else {
        const bubble = createBotBubble();
        renderStructuredResponse(bubble, msg.text);
      }
    });

    // Mark active in sidebar
    document.querySelectorAll(".conv-item").forEach((li) => {
      li.classList.toggle("active", li.dataset.id === id);
    });
  } catch (err) {
    console.error("[FloodBot] Failed to open conversation:", err);
  }
}

async function deleteConversation(id, liEl) {
  try {
    await fetch(`/api/chat/history/${id}`, { method: "DELETE" });
    liEl.remove();

    if (id === currentConversationId) {
      currentConversationId = null;
      chatContainer.innerHTML = "";
      showEmptyState(true);
    }

    if (convList.children.length === 0) {
      convList.innerHTML = '<li class="conv-empty">No conversations yet</li>';
    }
  } catch (err) {
    console.error("[FloodBot] Failed to delete conversation:", err);
  }
}

// ── UI helpers ─────────────────────────────────────────────────
function appendMessage(text, role) {
  const wrap = document.createElement("div");
  wrap.className = `message-wrap ${role}-wrap`;

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}-bubble`;
  bubble.textContent = text;

  wrap.appendChild(bubble);
  chatContainer.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function createBotBubble() {
  const wrap = document.createElement("div");
  wrap.className = "message-wrap bot-wrap";

  const avatar = document.createElement("div");
  avatar.className = "bot-avatar";
  avatar.textContent = "F";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble bot-bubble";

  const body = document.createElement("div");
  body.className = "bubble-body";

  bubble.appendChild(body);
  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chatContainer.appendChild(wrap);
  scrollToBottom();
  return bubble;
}

function renderBubbleError(bubble, message) {
  const body = bubble.querySelector(".bubble-body");
  body.innerHTML = `<span class="error-text">⚠ ${message}</span>`;
}

function appendErrorMessage(text) {
  const wrap = createBotBubble();
  renderBubbleError(wrap, text);
}

function showEmptyState(show) {
  emptyState.style.display = show ? "flex" : "none";
  chatContainer.style.display = show ? "none" : "flex";
}

function showTyping(show) {
  typingInd.style.display = show ? "flex" : "none";
  if (show) scrollToBottom();
}

function setStreaming(active) {
  isStreaming = active;
  sendBtn.disabled = active;
  sendBtn.classList.toggle("loading", active);
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Fallback for plain text — preserves bold markdown and line breaks
function formatPlainText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/(\r\n|\n|\r)/g, "<br>");
}

// ── Boot ───────────────────────────────────────────────────────
loadConversationList();