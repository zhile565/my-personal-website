const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  
  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers
    });
  }
  
  export async function onRequestPost(context) {
    const { request, env } = context;
    const body = await request.json().catch(() => null);
    const sessionId = String(body?.sessionId || "").trim();
  
    if (!sessionId || sessionId.length > 100) {
      return json({ error: "会话参数不正确" }, 400);
    }
  
    const id = crypto.randomUUID();
    const now = Date.now();
  
    await env.DB
      .prepare(
        `INSERT INTO conversations
         (id, session_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, sessionId, "新对话", now, now)
      .run();
  
    return json({
      conversation: {
        id,
        title: "新对话",
        created_at: now,
        updated_at: now
      }
    }, 201);
  }
  
  export async function onRequestDelete(context) {
    const { request, env } = context;
    const body = await request.json().catch(() => null);
    const sessionId = String(body?.sessionId || "").trim();
    const conversationId = String(body?.conversationId || "").trim();
  
    if (!sessionId || !conversationId) {
      return json({ error: "缺少会话参数" }, 400);
    }
  
    const conversation = await env.DB
      .prepare(
        "SELECT id FROM conversations WHERE id = ? AND session_id = ?"
      )
      .bind(conversationId, sessionId)
      .first();
  
    if (!conversation) {
      return json({ error: "聊天会话不存在" }, 404);
    }
  
    await env.DB
      .prepare("DELETE FROM messages WHERE conversation_id = ?")
      .bind(conversationId)
      .run();
  
    await env.DB
      .prepare("DELETE FROM conversations WHERE id = ? AND session_id = ?")
      .bind(conversationId, sessionId)
      .run();
  
    return json({ success: true });
  }
  