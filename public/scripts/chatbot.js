let currentConversationId = null;
let isLoading = false;
let typingIndicatorEl = null;


const form             = document.getElementById("myForm");
const queryInput       = document.getElementById("query");
const chatContainer    = document.getElementById("chatContainer");
const emptyState       = document.getElementById("emptyState");
const sendBtn          = document.getElementById("sendBtn");
const convList         = document.getElementById("convList");
const newChatBtn       = document.getElementById("newChatBtn");
const sidebar          = document.getElementById("sidebar");
const sidebarToggle    = document.getElementById("sidebarToggle");


queryInput.addEventListener("input", () => {
  queryInput.style.height = "auto";
  queryInput.style.height = Math.min(queryInput.scrollHeight, 160) + "px";
});


queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});


sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("open"));


newChatBtn.addEventListener("click", () => {
  currentConversationId = null;
  chatContainer.innerHTML = "";
  showEmptyState(true);
  sidebar.classList.remove("open");
});


document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    queryInput.value = chip.dataset.q;
    form.requestSubmit();
  });
});


form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isLoading) return;

  const query = queryInput.value.trim();
  if (!query) return;

  queryInput.value = "";
  queryInput.style.height = "auto";

  showEmptyState(false);
  appendUserMessage(query);
  setLoading(true);

  try {
    await fetchAndRenderResponse(query);
  } catch (err) {
    appendErrorMessage("Connection lost. Please try again.");
    console.error("[FloodBot] Request error:", err);
  } finally {
    setLoading(false);
  }
});

async function fetchAndRenderResponse(query) {
  const res = await fetch("/api/chat/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      conversationId: currentConversationId,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    appendErrorMessage(data.error || "Something went wrong. Please try again.");
    return;
  }

 
  if (data.conversationId) {
    currentConversationId = data.conversationId;
  }

  renderBotResponse(data.response);
  loadConversationList();
}


function renderBotResponse(parsed) {
  const wrap = document.createElement("div");
  wrap.className = "message-wrap bot-wrap";

  const avatar = document.createElement("div");
  avatar.className = "bot-avatar";
  avatar.textContent = "F";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble bot-bubble";


  if (typeof parsed === "string") {
    const mdWrap = document.createElement("div");
    mdWrap.className = "response-summary markdown-body";
    mdWrap.innerHTML = marked.parse(parsed);
    bubble.appendChild(mdWrap);
  } 
  
  else {
   
    if (parsed.error) {
      const errEl = document.createElement("p");
      errEl.className = "response-error";
      errEl.textContent = "⚠ " + parsed.error;
      bubble.appendChild(errEl);
      wrap.appendChild(avatar);
      wrap.appendChild(bubble);
      chatContainer.appendChild(wrap);
      scrollToBottom();
      return;
    }

  
    if (parsed.urgency) {
      const badge = document.createElement("span");
      badge.className = `urgency-badge urgency-${parsed.urgency}`;
      const icons = { high: "🔴", medium: "🟡", low: "🟢" };
      const labels = { high: "High priority", medium: "Medium priority", low: "Low priority" };
      badge.textContent = `${icons[parsed.urgency] || ""} ${labels[parsed.urgency] || parsed.urgency}`;
      bubble.appendChild(badge);
    }

   
    if (parsed.summary) {
      const summary = document.createElement("div");
      summary.className = "response-summary markdown-body";
      summary.innerHTML = marked.parse(parsed.summary);
      bubble.appendChild(summary);
    }

   
    if (parsed.steps && parsed.steps.length > 0) {
      const stepsHeader = document.createElement("p");
      stepsHeader.className = "response-section-label";
      stepsHeader.textContent = "Steps to take";
      bubble.appendChild(stepsHeader);

      const ol = document.createElement("ol");
      ol.className = "response-steps";
      parsed.steps.forEach((step) => {
        const li = document.createElement("li");
        li.textContent = step;
        ol.appendChild(li);
      });
      bubble.appendChild(ol);
    }

  
    if (parsed.warning) {
      const warn = document.createElement("div");
      warn.className = "response-warning";
      warn.innerHTML = `<strong>⚠ Safety note:</strong> ${escapeHtml(parsed.warning)}`;
      bubble.appendChild(warn);
    }

  
    if (parsed.followUp && parsed.followUp.length > 0) {
      const label = document.createElement("p");
      label.className = "response-section-label";
      label.textContent = "You might also ask";
      bubble.appendChild(label);

      const chipRow = document.createElement("div");
      chipRow.className = "followup-chips";
      parsed.followUp.forEach((q) => {
        const btn = document.createElement("button");
        btn.className = "chip followup-chip";
        btn.textContent = q;
        btn.addEventListener("click", () => {
          queryInput.value = q;
          form.requestSubmit();
        });
        chipRow.appendChild(btn);
      });
      bubble.appendChild(chipRow);
    }
  }

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chatContainer.appendChild(wrap);
  scrollToBottom();
}


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
      del.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
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
        appendUserMessage(msg.text);
      } else {
        let parsed;
        try {
          parsed = JSON.parse(msg.text);
        } catch {
          parsed = msg.text; 
        }
        renderBotResponse(parsed);
      }
    });

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


function appendUserMessage(text) {
  const wrap = document.createElement("div");
  wrap.className = "message-wrap user-wrap";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble user-bubble";
  bubble.textContent = text;

  wrap.appendChild(bubble);
  chatContainer.appendChild(wrap);
  scrollToBottom();
}

function appendErrorMessage(text) {
  const wrap = document.createElement("div");
  wrap.className = "message-wrap bot-wrap";

  const avatar = document.createElement("div");
  avatar.className = "bot-avatar";
  avatar.textContent = "F";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble bot-bubble";

  const errEl = document.createElement("p");
  errEl.className = "response-error";
  errEl.textContent = "⚠ " + text;
  bubble.appendChild(errEl);

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chatContainer.appendChild(wrap);
  scrollToBottom();
}

function showEmptyState(show) {
  emptyState.style.display   = show ? "flex" : "none";
  chatContainer.style.display = show ? "none" : "flex";
}

function setLoading(active) {
  isLoading = active;
  sendBtn.disabled = active;
  sendBtn.classList.toggle("loading", active);

  if (active) {
    typingIndicatorEl = document.createElement("div");
    typingIndicatorEl.className = "message-wrap bot-wrap";
    typingIndicatorEl.innerHTML = `
      <div class="bot-avatar">F</div>
      <div class="typing-bubble">
        <span></span><span></span><span></span>
      </div>
    `;
    chatContainer.appendChild(typingIndicatorEl);
    scrollToBottom();
  } else if (typingIndicatorEl) {
    typingIndicatorEl.remove();
    typingIndicatorEl = null;
  }
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}


function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
loadConversationList();