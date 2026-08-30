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
  
  export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId")?.trim();
    const conversationId = url.searchParams.get("conversationId")?.trim();
  
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
  
    const messages = await env.DB
      .prepare(
        `SELECT id, role, content, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC`
      )
      .bind(conversationId)
      .all();
  
    return json({ messages: messages.results || [] });
  }
  