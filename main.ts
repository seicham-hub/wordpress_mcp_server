import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

// Create an MCP server
const server = new McpServer({
  name: "wordpress-poster",
  version: "1.0.0"
});

// WARNING: cursorは現在未対応: https://modelcontextprotocol.io/clients#feature-support-matrix
// Add a dynamic greeting resource
// server.resource(
//   "greeting",
//   new ResourceTemplate("greeting://{name}", { list: undefined }),
//   async (uri, { name }) => ({
//     contents: [{
//       uri: uri.href,
//       text: `Hello, ${name}!`
//     }]
//   })
// );

// 共通: 認証情報とURL取得
function getWpConfig() {
  return {
    url: process.env.WORDPRESS_URL!,
    username: process.env.WORDPRESS_USERNAME!,
    password: process.env.APPLICATION_PASSWORD!,
  };
}

// 共通: 認証ヘッダー生成
function getAuthHeaders() {
  const { username, password } = getWpConfig();
  return {
    "Authorization": "Basic " + Buffer.from(`${username}:${password}`).toString("base64")
  };
}

// 共通: fetchラッパー
async function wpFetch(path: string, options: any = {}) {
  const { url } = getWpConfig();
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {})
  };
  const response = await fetch(`${url}${path}`, { ...options, headers });
  return response;
}

server.tool(
  "create_post",
  {
    title: z.string(),
    content: z.string(),
  },
  async ({ title, content }: { title: string, content: string }) => {
    const response = await wpFetch("/wp-json/wp/v2/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, status: "draft" })
    });
    if (!response.ok) {
      const error = await response.text();
      return { content: [{ type: "text", text: `投稿失敗: ${error}` }] };
    }
    const data = await response.json();
    return { content: [{ type: "text", text: `投稿成功: ${data}` }] };
  }
);

server.tool(
  "edit_post",
  {
    id: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
    status: z.string().optional(),
    categories: z.array(z.string()).optional(),
  },
  async ({ id, title, content, status, categories }: { id: string, title?: string, content?: string, status?: string, categories?: string[] }) => {
    const body: any = {};
    if (title) body.title = title;
    if (content) body.content = content;
    if (status) body.status = status;
    if (categories) body.categories = categories.map(Number);
    const response = await wpFetch(`/wp-json/wp/v2/posts/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const error = await response.text();
      return { content: [{ type: "text", text: `編集失敗: ${error}` }] };
    }
    const post = await response.json() as any;
    return { content: [{ type: "text", text: `編集成功: ID: ${post.id}, タイトル: ${post.title.rendered}` }] };
  }
);

server.tool(
  "list_posts",
  {},
  async () => {
    const response = await wpFetch("/wp-json/wp/v2/posts");
    if (!response.ok) {
      const error = await response.text();
      return { content: [{ type: "text", text: `取得失敗: ${error}` }] };
    }
    const posts = await response.json() as any[];
    const text = posts.map((post: any) => `ID: ${post.id}, タイトル: ${post.title.rendered}`).join("\n");
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "get_post",
  {
    id: z.string(),
  },
  async ({ id }: { id: string }) => {
    const response = await wpFetch(`/wp-json/wp/v2/posts/${id}`);
    if (!response.ok) {
      const error = await response.text();
      return { content: [{ type: "text", text: `取得失敗: ${error}` }] };
    }
    const post = await response.json() as any;
    const text = `タイトル: ${post.title.rendered}\n内容: ${post.content.rendered}`;
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "list_categories",
  {},
  async () => {
    const response = await wpFetch("/wp-json/wp/v2/categories");
    if (!response.ok) {
      const error = await response.text();
      return { content: [{ type: "text", text: `取得失敗: ${error}` }] };
    }
    const categories = await response.json() as any[];
    const text = categories.map((cat: any) => `ID: ${cat.id}, 名前: ${cat.name}`).join("\n");
    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "edit_category",
  {
    id: z.string(),
    name: z.string(),
  },
  async ({ id, name }: { id: string, name: string }) => {
    const response = await wpFetch(`/wp-json/wp/v2/categories/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (!response.ok) {
      const error = await response.text();
      return { content: [{ type: "text", text: `編集失敗: ${error}` }] };
    }
    const category = await response.json() as any;
    return { content: [{ type: "text", text: `編集成功: ID: ${category.id}, 新しい名前: ${category.name}` }] };
  }
);

server.tool(
  "create_category",
  {
    name: z.string(),
    description: z.string().optional(),
    parent: z.string().optional(),
  },
  async ({ name, description, parent }: { name: string, description?: string, parent?: string }) => {
    const body: any = { name };
    if (description) body.description = description;
    if (parent) body.parent = parseInt(parent, 10);
    const response = await wpFetch("/wp-json/wp/v2/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const error = await response.text();
      return { content: [{ type: "text", text: `追加失敗: ${error}` }] };
    }
    const category = await response.json() as any;
    return { content: [{ type: "text", text: `追加成功: ID: ${category.id}, 名前: ${category.name}` }] };
  }
);

server.tool(
  "delete_category",
  {
    id: z.string(),
    force: z.boolean().optional(),
  },
  async ({ id, force }: { id: string, force?: boolean }) => {
    const params = force ? `?force=${force}` : "";
    const response = await wpFetch(`/wp-json/wp/v2/categories/${id}${params}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      const error = await response.text();
      return { content: [{ type: "text", text: `削除失敗: ${error}` }] };
    }
    return { content: [{ type: "text", text: `削除成功: ID: ${id}` }] };
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
console.log("Server started");