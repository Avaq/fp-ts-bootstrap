import * as HTTP from 'node:http';
import * as E from 'fp-ts/Either';

import * as Bracket from '../../src/Bracket';
import * as Service from '../../src/Service';

/*\
 *
 * This service provides a server that listens on the specified port and uses
 * the provided request listener.
 *
 * Its purpose is to demonstrate how to use the Bracket module to create a
 * service that depends on other services, has an acquisition step, and has a
 * disposal step. This should represent the most common use case for the
 * Bracket module.
 *
\*/


type Dependencies = {
  port: number;
  app: HTTP.RequestListener;
};

export const withServer: Service.Service<Error, Dependencies, HTTP.Server> = (
  ({port, app}) => Bracket.bracket(
    () => new Promise(resolve => {
      const server = HTTP.createServer(app);
      server.once('error', e => resolve(E.left(e)));
      server.listen(port, () => resolve(E.right(server)));
    }),
    server => () => new Promise(resolve => {
      server.removeAllListeners('error');
      server.close((e: unknown) => resolve(
        e instanceof Error ? E.left(e) : E.right(undefined)
      ));
    }),
  )
);

export type Server = Service.ResourceOf<typeof withServer>;
