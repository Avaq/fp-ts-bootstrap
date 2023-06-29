import * as Console from 'fp-ts/Console';
import {constVoid, constant} from 'fp-ts/function';

import * as Bracket from '../../src/Bracket';
import * as Service from '../../src/Service';

/*\
 *
 * This is the service that provides the logger.
 *
 * Its purpose is to demonstrate how to use the Bracket module to create a
 * service that only transforms its dependencies as an acquisition step, and
 * does not have a disposal step.
 *
\*/

export type Dependencies = {
  level: string;
};

export const withLogger: Service.Service<Error, Dependencies, typeof Console> = (
  ({level}) => Bracket.of({
    log: level === 'log' ? Console.log : constant(constVoid),
    info: level === 'info' ? Console.info : constant(constVoid),
    warn: level === 'warn' ? Console.warn : constant(constVoid),
    error: level === 'error' ? Console.error : constant(constVoid),
  })
);

export type Logger = Service.ResourceOf<typeof withLogger>;
