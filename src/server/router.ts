import { performJsSyscall } from "./impl/syscall.js";
import { PublicHttpAction } from "./registration.js";

// Note: this list is duplicated in the dashboard.
/**
 * A list of the methods supported by Convex HTTP actions.
 *
 * HEAD is handled by Convex by running GET and stripping the body.
 * CONNECT is not supported and will not be supported.
 * TRACE is not supported and will not be supported.
 *
 * @public
 */
export const ROUTABLE_HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
  "PATCH",
] as const;
/**
 * A type representing the methods supported by Convex HTTP actions.
 *
 * HEAD is handled by Convex by running GET and stripping the body.
 * CONNECT is not supported and will not be supported.
 * TRACE is not supported and will not be supported.
 *
 * @public
 */
export type RoutableMethod = (typeof ROUTABLE_HTTP_METHODS)[number];

export function normalizeMethod(
  method: RoutableMethod | "HEAD"
): RoutableMethod {
  // This router routes HEAD requests as GETs, letting Axum strip thee response
  // bodies are response bodies afterward.
  if (method === "HEAD") return "GET";
  return method;
}

/**
 * Return a new {@link HttpRouter} object.
 *
 * @public
 */
export const httpRouter = () => new HttpRouter();

type RouteSpec =
  | {
      path: string;
      method: RoutableMethod;
      handler: PublicHttpAction;
    }
  | {
      pathPrefix: string;
      method: RoutableMethod;
      handler: PublicHttpAction;
    };

/**
 * HTTP router for specifying the paths and methods of {@link httpActionGeneric}s
 *
 * An example `convex/http.js` file might look like this.
 *
 * ```js
 * import { httpRouter } from "convex/server";
 * import { getMessagesByAuthor } from "./getMessagesByAuthor";
 * import { httpAction } from "./_generated/server";
 *
 * const http = httpRouter();
 *
 * // HTTP actions can be defined inline...
 * http.route({
 *   path: "/message",
 *   method: "POST",
 *   handler: httpAction(async ({ runMutation }, request) => {
 *     const { author, body } = await request.json();
 *
 *     await runMutation("sendMessage", { body, author });
 *     return new Response(null, {
 *       status: 200,
 *     });
 *   })
 * });
 *
 * // ...or they can be imported from other files.
 * http.route({
 *   path: "/getMessagesByAuthor",
 *   method: "GET",
 *   handler: getMessagesByAuthor,
 * });
 *
 * // Convex expects the router to be the default export of `convex/http.js`.
 * export default http;
 * ```
 *
 * @public
 */
export class HttpRouter {
  exactRoutes: Map<string, Map<RoutableMethod, PublicHttpAction>> = new Map();
  prefixRoutes: Map<RoutableMethod, Map<string, PublicHttpAction>> = new Map();
  isRouter = true;

  /**
   * Specify an HttpAction to be used to respond to requests
   * for an HTTP method (e.g. "GET") and a path or pathPrefix.
   *
   * Paths must begin with a slash. Path prefixes must also end in a slash.
   *
   * ```js
   * // matches `/profile` (but not `/profile/`)
   * http.route({ path: "/profile", method: "GET", handler: getProfile})
   *
   * // matches `/profiles/`, `/profiles/abc`, and `/profiles/a/c/b` (but not `/profile`)
   * http.route({ pathPrefix: "/profile/", method: "GET", handler: getProfile})
   * ```
   */
  route = (spec: RouteSpec) => {
    if (!spec.handler) throw new Error(`route requires handler`);
    if (!spec.method) throw new Error(`route requires method`);
    const { method, handler } = spec;
    if (!ROUTABLE_HTTP_METHODS.includes(method)) {
      throw new Error(
        `'${method}' is not an allowed HTTP method (like GET, POST, PUT etc.)`
      );
    }

    if ("path" in spec) {
      if (!spec.path.startsWith("/")) {
        throw new Error(`path '${spec.path}' does not start with a /`);
      }
      const prefixes =
        this.prefixRoutes.get(method) || new Map<string, PublicHttpAction>();
      for (const [prefix, _] of prefixes.entries()) {
        if (spec.path.startsWith(prefix)) {
          throw new Error(
            `${spec.method} path ${spec.path} is shadowed by pathPrefix ${prefix}`
          );
        }
      }
      const methods: Map<RoutableMethod, PublicHttpAction> =
        this.exactRoutes.has(spec.path)
          ? this.exactRoutes.get(spec.path)!
          : new Map();
      if (methods.has(method)) {
        throw new Error(
          `Path '${spec.path}' for method ${method} already in use`
        );
      }
      methods.set(method, handler);
      this.exactRoutes.set(spec.path, methods);
    } else {
      if (!spec.pathPrefix.startsWith("/")) {
        throw new Error(`path '${spec.pathPrefix}' does not start with a /`);
      }
      if (!spec.pathPrefix.endsWith("/")) {
        throw new Error(`pathPrefix ${spec.pathPrefix} must end with a /`);
      }
      const prefixes =
        this.prefixRoutes.get(method) || new Map<string, PublicHttpAction>();
      for (const [prefix, _] of prefixes.entries()) {
        if (spec.pathPrefix.startsWith(prefix)) {
          throw new Error(
            `${spec.method} pathPrefix ${spec.pathPrefix} is shadowed by pathPrefix ${prefix}`
          );
        }
      }
      prefixes.set(spec.pathPrefix, handler);
      this.prefixRoutes.set(method, prefixes);
    }
  };

  /**
   * Returns a list of routed HTTP actions.
   *
   * These are used to populate the list of routes shown in the Functions page of the Convex dashboard.
   *
   * @returns - an array of [path, method, endpoint] tuples.
   */
  getRoutes = (): Array<
    Readonly<[string, RoutableMethod, (...args: any[]) => any]>
  > => {
    const exactPaths: string[] = [...this.exactRoutes.keys()].sort();
    const exact = exactPaths.flatMap(path =>
      [...this.exactRoutes.get(path)!.keys()]
        .sort()
        .map(
          method =>
            [path, method, this.exactRoutes.get(path)!.get(method)!] as const
        )
    );

    const prefixPathMethods = [...this.prefixRoutes.keys()].sort();
    const prefixes = prefixPathMethods.flatMap(method =>
      [...this.prefixRoutes.get(method)!.keys()]
        .sort()
        .map(
          pathPrefix =>
            [
              `${pathPrefix}*`,
              method,
              this.prefixRoutes.get(method)!.get(pathPrefix)!,
            ] as const
        )
    );

    return [...exact, ...prefixes];
  };

  /**
   * Returns the appropriate HTTP action and its routed request path and method.
   *
   * The path and method returned are used for logging and metrics, and should
   * match up with one of the routes returned by `getRoutes`.
   *
   * For example,
   *
   * ```js
   * http.route({ pathPrefix: "/profile/", method: "GET", handler: getProfile});
   *
   * http.lookup("/profile/abc", "GET") // returns [getProfile, "GET", "/profile/*"]
   *```
   *
   * @returns - a tuple [{@link PublicHttpAction}, method, path] or null.
   */
  lookup = (
    path: string,
    method: RoutableMethod | "HEAD"
  ): Readonly<[PublicHttpAction, RoutableMethod, string]> | null => {
    method = normalizeMethod(method);
    const exactMatch = this.exactRoutes.get(path)?.get(method);
    if (exactMatch) return [exactMatch, method, path];

    const prefixes = this.prefixRoutes.get(method) || new Map();
    for (const [pathPrefix, endpoint] of prefixes.entries()) {
      if (path.startsWith(pathPrefix)) {
        return [endpoint, method, `${pathPrefix}*`];
      }
    }
    return null;
  };

  /**
   * Given a JSON string representation of a Request object, return a Response
   * by routing the request and running the appropriate endpoint or returning
   * a 404 Response.
   *
   * @param argsStr - a JSON string representing a Request object.
   *
   * @returns - a Response object.
   */
  runRequest = async (argsStr: string): Promise<string> => {
    const request = performJsSyscall("requestFromConvexJson", {
      convexJson: JSON.parse(argsStr),
    });

    const pathname = new URL(request.url).pathname;

    const method = request.method;
    const match = this.lookup(pathname, method as RoutableMethod);
    if (!match) {
      const response = new Response(`No HttpAction routed for ${pathname}`, {
        status: 404,
      });
      return JSON.stringify(
        performJsSyscall("convexJsonFromResponse", { response })
      );
    }
    const [endpoint, _method, _path] = match;
    const response = await endpoint.invokeHttpAction(request);
    return JSON.stringify(
      performJsSyscall("convexJsonFromResponse", { response })
    );
  };
}
