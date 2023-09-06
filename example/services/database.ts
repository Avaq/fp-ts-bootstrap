import * as FS from 'node:fs/promises'

import * as TE from 'fp-ts/TaskEither';
import {toError} from 'fp-ts/Either';
import {pipe} from 'fp-ts/function';

import * as Bracket from '../../src/Bracket';
import {Service} from '../../src/Service';

import {Logger} from './logger';

/*\
 *
 * This service provides a contrived "database" object. Its only method simply
 * appends a string to a file.
 *
 * Its purpose is to demonstrate how to use the Bracket module to create a
 * service that acquires and disposes of a resource, but does not expose the
 * resource itself. This is achieved by using `Bracket.map` to transform the
 * resource into a new object with a different interface.
 *
\*/

export type Dependencies = {
  url: string;
  logger: Logger;
};

export type Database = {
  save: (data: string) => TE.TaskEither<Error, void>;
};

const acquireFileHandle = (url: string) => (
  TE.tryCatch(() => FS.open(url, 'a'), toError)
);

const disposeFileHandle = (file: FS.FileHandle) => (
  TE.tryCatch(() => file.close(), toError)
);

export const withDatabase: Service<Error, Dependencies, Database> = (
  ({url, logger}) => pipe(
    Bracket.bracket(acquireFileHandle(url), disposeFileHandle),
    Bracket.map(file => ({
      save: data => pipe(
        TE.fromIO(logger.info(`Saving ${data} to ${url}`)),
        TE.apSecond(TE.tryCatch(() => file.writeFile(`${data}\n`), toError)),
      ),
    })),
  )
);
