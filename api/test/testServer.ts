import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll } from 'vitest';

/**
 * A local HTTP server with one route per scenario the link checker must handle.
 * It listens on 127.0.0.1, so a redirect to "localhost" counts as another host.
 */
function createScenarioServer(): Server {
  return createServer((req, res) => {
    const port = (req.socket.address() as AddressInfo).port;
    switch (req.url) {
      case '/ok':
        res.writeHead(200).end('ok');
        return;
      case '/redirect-same':
        res.writeHead(302, { location: '/ok' }).end();
        return;
      case '/redirect-away':
        res.writeHead(302, { location: `http://localhost:${port}/ok` }).end();
        return;
      case '/missing':
        res.writeHead(404).end();
        return;
      case '/server-error':
        res.writeHead(500).end();
        return;
      case '/no-head':
        res.writeHead(req.method === 'HEAD' ? 405 : 200).end();
        return;
      case '/slow':
        setTimeout(() => res.writeHead(200).end(), 1_000);
        return;
      default:
        res.writeHead(404).end();
    }
  });
}

/** Start the scenario server for the test file; returns a URL builder. */
export function useScenarioServer() {
  const server = createScenarioServer();
  let base = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  return (path: string) => `${base}${path}`;
}

/** A localhost URL on a port nothing listens on (connection refused). */
export async function closedPortUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return `http://127.0.0.1:${port}/`;
}
