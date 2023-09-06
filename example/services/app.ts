import * as HTTP from 'node:http';

import {pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';

import * as Bracket from '../../src/Bracket';
import * as Service from '../../src/Service';

import {Database} from './database';

/*\
 *
 * This service provides an HTTP Request Listener that logs the request URL
 * and the current time to the database, and returns a "Hello, world!" response.
 *
 * Its purpose is to demonstrate how to use the Bracket module to create a
 * service that depends on other services.
 *
\*/

export type Dependencies = {
  database: Database;
};

export const withApp: Service.Service<Error, Dependencies, HTTP.RequestListener> = (
  ({database}) => Bracket.of((req, res) => {
    const task = pipe(
      TE.fromIO(() => new Date()),
      TE.chain(now => database.save(`Visit to ${req.url} at ${now.toISOString()}`)),
      TE.map(() => 'Hello, world!'),
    );

    task().then(E.fold(
      e => {
        res.writeHead(500, {'Content-Type': 'text/plain'});
        res.end(e.message);
      },
      data => {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(data);
      },
    ))
  })
);

export type App = Service.ResourceOf<typeof withApp>;
