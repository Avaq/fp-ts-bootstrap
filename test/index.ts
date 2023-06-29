import * as path from 'path';
import * as FC from 'fast-check';
import {pipe} from 'fp-ts/function';
import * as O from 'fp-ts/Option';
import * as T from 'fp-ts/Task';
import * as IO from 'fp-ts/IO';

const root = path.relative(path.resolve(__dirname, '../src'), process.argv[1]);

const filter = O.fromNullable(process.env.TEST_FILTER);

let tests = 0;
let okays = 0;
let fails = 0;

export const test = async(name: string, task: T.Task<void> | IO.IO<void>) => {
  if (pipe(filter, O.fold(() => false, f => !name.includes(f)))) {
    console.log('[skip]', root, '⟫', name);
    return;
  }

  tests = tests + 1;
  try {
    await task();
    console.log('[okay]', root, '⟫', name);
    okays = okays + 1;
  } catch (e) {
    console.error('[fail]', root, '⟫', name, '', e);
    fails = fails + 1;
  }
};

export const hold = <T>(name: string, prop: FC.IRawProperty<T>, opts?: FC.Parameters<T>) => (
  test(`'${name}' holds`, () => FC.assert(prop, opts))
);

process.once('beforeExit', code => {
  if (code > 0) {
    console.error('[done]', root, '⟫ Exiting with non-zero exit code');
    process.exit(code);
  }
  if (tests > okays + fails) {
    console.error('[done]', root, '⟫ A number of tests never completed');
    process.exit(1);
  }
  if (fails > 0) {
    console.error('[done]', root, '⟫', `${fails} Tests have failed`);
    process.exit(1);
  }
  console.log('[done]', root, `⟫ All ${tests} tests okay`);
});
