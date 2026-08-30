const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatMessages = document.querySelector("#chatMessages");
const sendButton = document.querySelector("#sendButton");
const clearChatButton = document.querySelector("#clearChatButton");
const chatStatus = document.querySelector("#chatStatus");

const SESSION_KEY = "personal-chat-session-id";
const CONVERSATION_KEY = "personal-chat-conversation-id";

function getOrCreateSessionId() {
    let sessionId = localStorage.getItem(SESSION_KEY);

    if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem(SESSION_KEY, sessionId);
    }

    return sessionId;
}

function addMessage(role, content) {
    const element = document.createElement("div");
    element.className = `chat-message ${role}`;
    element.textContent = content;
    chatMessages.appendChild(element);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return element;
}

async function createConversation() {
    const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            sessionId: getOrCreateSessionId()
        })
    });

    if (!response.ok) {
        throw new Error("无法创建聊天会话");
    }

    const data = await response.json();
    localStorage.setItem(
        CONVERSATION_KEY,
        data.conversation.id
    );

    return data.conversation.id;
}

async function getConversationId() {
    let conversationId = localStorage.getItem(CONVERSATION_KEY);

    if (!conversationId) {
        conversationId = await createConversation();
    }

    return conversationId;
}

async function loadHistory() {
    try {
        const conversationId = await getConversationId();
        const url = new URL("/api/history", window.location.origin);
        url.searchParams.set("sessionId", getOrCreateSessionId());
        url.searchParams.set("conversationId", conversationId);

        const response = await fetch(url);
        if (!response.ok) return;

        const data = await response.json();
        for (const message of data.messages || []) {
            addMessage(message.role, message.content);
        }
    } catch (error) {
        console.error(error);
        chatStatus.textContent = "历史记录暂时无法加载";
    }
}

chatForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = chatInput.value.trim();
    if (!message || message.length > 2000) return;

    sendButton.disabled = true;
    chatInput.disabled = true;
    chatStatus.textContent = "助手正在回答...";
    addMessage("user", message);
    chatInput.value = "";

    try {
        const conversationId = await getConversationId();
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                sessionId: getOrCreateSessionId(),
                conversationId,
                message
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "请求失败");
        }

        addMessage("assistant", data.answer);
        chatStatus.textContent = "";
    } catch (error) {
        console.error(error);
        addMessage("assistant", `请求失败：${error.message}`);
        chatStatus.textContent = "";
    } finally {
        sendButton.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
});

clearChatButton?.addEventListener("click", async () => {
    const conversationId = localStorage.getItem(CONVERSATION_KEY);
    if (!conversationId) return;

    const confirmed = window.confirm("确定删除当前聊天记录吗？");
    if (!confirmed) return;

    try {
        const response = await fetch("/api/conversations", {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                sessionId: getOrCreateSessionId(),
                conversationId
            })
        });

        if (!response.ok) {
            throw new Error("删除失败");
        }

        localStorage.removeItem(CONVERSATION_KEY);
        chatMessages.replaceChildren();
        await createConversation();
        chatStatus.textContent = "当前聊天记录已删除";
    } catch (error) {
        console.error(error);
        chatStatus.textContent = error.message;
    }
});

loadHistory();
