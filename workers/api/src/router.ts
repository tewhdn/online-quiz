import type { Handler, RouteOptions } from './types/env.ts';

export interface MatchedRoute {
  handler: Handler;
  options: RouteOptions;
  params: Record<string, string>;
}

interface CompiledRoute {
  method: string;
  regex: RegExp;
  keys: string[];
  handler: Handler;
  options: RouteOptions;
}

/** 轻量路由：支持 :param 占位符，按注册顺序匹配。 */
export class Router {
  private routes: CompiledRoute[] = [];

  add(method: string, pattern: string, handler: Handler, options: RouteOptions = {}): void {
    const keys: string[] = [];
    const source = pattern
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          keys.push(segment.slice(1));
          return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    this.routes.push({
      method: method.toUpperCase(),
      regex: new RegExp(`^${source}/?$`),
      keys,
      handler,
      options,
    });
  }

  get(pattern: string, handler: Handler, options?: RouteOptions): void {
    this.add('GET', pattern, handler, options);
  }
  post(pattern: string, handler: Handler, options?: RouteOptions): void {
    this.add('POST', pattern, handler, options);
  }
  put(pattern: string, handler: Handler, options?: RouteOptions): void {
    this.add('PUT', pattern, handler, options);
  }
  patch(pattern: string, handler: Handler, options?: RouteOptions): void {
    this.add('PATCH', pattern, handler, options);
  }
  delete(pattern: string, handler: Handler, options?: RouteOptions): void {
    this.add('DELETE', pattern, handler, options);
  }

  match(method: string, pathname: string): MatchedRoute | null {
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      const result = route.regex.exec(pathname);
      if (!result) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(result[index + 1] ?? '');
      });
      return { handler: route.handler, options: route.options, params };
    }
    return null;
  }

  hasPath(pathname: string): boolean {
    return this.routes.some((route) => route.regex.test(pathname));
  }

  methodsFor(pathname: string): string[] {
    const methods = new Set<string>();
    for (const route of this.routes) {
      if (route.regex.test(pathname)) methods.add(route.method);
    }
    return Array.from(methods);
  }
}
