const jsonHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  
  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: jsonHeaders
    });
  }
  
  function createId() {
    return crypto.randomUUID();
  }
  
  export async function onRequestPost(context) {
    const { request, env } = context;
  
    if (!env.DB || !env.DEEPSEEK_API_KEY) {
      return json({ error: "服务配置不完整" }, 500);
    }
  
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "请求格式不正确" }, 400);
    }
  
    const sessionId = String(body.sessionId || "").trim();
    const conversationId = String(body.conversationId || "").trim();
    const message = String(body.message || "").trim();
  
    if (!sessionId || !conversationId || !message) {
      return json({ error: "缺少必要参数" }, 400);
    }
  
    if (sessionId.length > 100 || conversationId.length > 100) {
      return json({ error: "会话参数不正确" }, 400);
    }
  
    if (message.length > 2000) {
      return json({ error: "单条消息不能超过 2000 个字符" }, 400);
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
  
    const now = Date.now();
  
    const recentMessages = await env.DB
      .prepare(
        `SELECT role, content
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT 20`
      )
      .bind(conversationId)
      .all();
  
    const history = (recentMessages.results || [])
      .reverse()
      .map((item) => ({
        role: item.role,
        content: item.content
      }));
  
    const userMessageId = await env.DB
      .prepare(
        `INSERT INTO messages
         (conversation_id, role, content, created_at)
         VALUES (?, 'user', ?, ?)`
      )
      .bind(conversationId, message, now)
      .run();
  
    const deepseekResponse = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek-v4-flash",
          messages: [
            {
              role: "system",
              content: "你是一个友好、准确、简洁的中文聊天助手。"
            },
            ...history,
            {
              role: "user",
              content: message
            }
          ],
          stream: false,
          temperature: 0.7,
          max_tokens: 1500
        })
      }
    );
  
    if (!deepseekResponse.ok) {
      console.error("DeepSeek request failed", deepseekResponse.status);
      return json({ error: "AI 服务暂时不可用，请稍后再试" }, 502);
    }
  
    const result = await deepseekResponse.json();
    const answer = result.choices?.[0]?.message?.content?.trim();
  
    if (!answer) {
      return json({ error: "AI 没有返回有效内容" }, 502);
    }
  
    await env.DB
      .prepare(
        `INSERT INTO messages
         (conversation_id, role, content, created_at)
         VALUES (?, 'assistant', ?, ?)`
      )
      .bind(conversationId, answer, Date.now())
      .run();
  
    await env.DB
      .prepare(
        "UPDATE conversations SET updated_at = ? WHERE id = ? AND session_id = ?"
      )
      .bind(Date.now(), conversationId, sessionId)
      .run();
  
    return json({
      answer,
      messageId: userMessageId.meta?.last_row_id || null
    });
  }
  