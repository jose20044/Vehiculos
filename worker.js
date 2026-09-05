
const GITHUB_OWNER  = 'jose20044';
const GITHUB_REPO   = 'Vehiculos';
const GITHUB_BRANCH = 'main';

// Dominio(s) permitidos a llamar este Worker (tu GitHub Pages).
// Puedes poner '*' mientras pruebas, pero es mejor restringirlo.
const ALLOWED_ORIGIN = 'https://jose20044.github.io';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN === '*' ? '*' : origin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function ghHeaders(env) {
  return {
    'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'vehiculos-proxy-worker',
  };
}

const GH_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

async function githubGetFile(path, env) {
  const res = await fetch(`${GH_API}/${path}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub GET falló: ' + res.status);
  return res.json(); // { content (base64), sha, ... }
}

async function githubListDir(path, env) {
  const res = await fetch(`${GH_API}/${path}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders(env) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('GitHub LIST falló: ' + res.status);
  return res.json();
}

async function githubUpsertFile(path, contentB64, message, env) {
  const existing = await githubGetFile(path, env).catch(() => null);
  const res = await fetch(`${GH_API}/${path}`, {
    method: 'PUT',
    headers: { ...ghHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: contentB64,
      branch: GITHUB_BRANCH,
      ...(existing && existing.sha ? { sha: existing.sha } : {}),
    }),
  });
  if (!res.ok) throw new Error('GitHub UPSERT falló: ' + res.status + ' ' + await res.text());
  return res.json();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action'); // 'get' | 'list' | 'upsert'
    const path = url.searchParams.get('path');

    try {
      if (!action || !path) {
        return new Response(JSON.stringify({ error: 'Falta action o path' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'get' && request.method === 'GET') {
        const data = await githubGetFile(path, env);
        return new Response(JSON.stringify(data), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'list' && request.method === 'GET') {
        const data = await githubListDir(path, env);
        return new Response(JSON.stringify(data), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'upsert' && request.method === 'PUT') {
        const body = await request.json(); // { content (base64), message }
        const data = await githubUpsertFile(path, body.content, body.message, env);
        return new Response(JSON.stringify(data), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Acción o método no soportado' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};
