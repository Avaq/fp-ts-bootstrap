import * as $E from 'fp-ts/Eq';
import * as $S from 'fp-ts/Show';
import * as Bracket from './Bracket';
import * as TE from 'fp-ts/TaskEither';
import * as T from 'fp-ts/Task';
import * as E from 'fp-ts/Either';
import * as R from 'fp-ts/Record';
import * as O from 'fp-ts/Option';
import * as Str from 'fp-ts/string';
import {constant, identity, pipe} from 'fp-ts/function';
import * as FC from 'fast-check';

import {hold} from '../test';
import {ShowUnknown, eqBy} from '../test/assert';

type BracketResult<E, R> =
  | {_tag: 'Success', resource: R}
  | {_tag: 'AcquisitionFailure', error: E}
  | {_tag: 'DisposalFailure', error: E, resource: R};

const BracketResultEq = <E, R>(EqE: $E.Eq<E>, EqR: $E.Eq<R>) => $E.fromEquals<BracketResult<E, R>>(
  (a, b) => {
    if (a._tag === 'Success' && b._tag === 'Success') {
      return EqR.equals(a.resource, b.resource);
    } else if (a._tag === 'AcquisitionFailure' && b._tag === 'AcquisitionFailure') {
      return EqE.equals(a.error, b.error);
    } else if (a._tag === 'DisposalFailure' && b._tag === 'DisposalFailure') {
      return EqE.equals(a.error, b.error) && EqR.equals(a.resource, b.resource);
    } else {
      return false;
    }
  }
);

const BracketResultShow = <E, R>(
  ShowE: $S.Show<E>,
  ShowR: $S.Show<R>
): $S.Show<BracketResult<E, R>> => ({
  show: (x) => {
    switch (x._tag) {
      case 'Success':
        return `Success(${ShowR.show(x.resource)})`;
      case 'AcquisitionFailure':
        return `AcquisitionFailure(${ShowE.show(x.error)})`;
      case 'DisposalFailure':
        return `DisposalFailure(${ShowE.show(x.error)}, ${ShowR.show(x.resource)})`;
    }
  }
});

const runBracket = <E, R>(consume: (resource: R) => TE.TaskEither<E, R>) => (
  (bracket: Bracket.Bracket<E, R>): Promise<BracketResult<E, R>> => (
    new Promise((resolve, reject) => {
      let acquired: O.Option<R> = O.none;
      bracket(x => {
        acquired = O.some(x);
        return consume(x);
      })().then(result => {
        if (O.isNone(acquired) && E.isLeft(result)) {
          resolve({_tag: 'AcquisitionFailure', error: result.left});
        } else if (O.isSome(acquired) && E.isLeft(result)) {
          resolve({_tag: 'DisposalFailure', error: result.left, resource: acquired.value});
        } else if (O.isSome(acquired) && E.isRight(result)) {
          resolve({_tag: 'Success', resource: acquired.value});
        } else {
          reject(new Error('runBracket state corruption'));
        }
      })
    })
  )
);

type BracketResults<E, R> = {
  onSuccesfulConsumption: BracketResult<E, R>;
  onFailedConsumption: BracketResult<E, R>;
};

const BracketResultsEq = <E, R>(Eq: $E.Eq<BracketResult<E, R>>) => $E.struct({
  onSuccesfulConsumption: Eq,
  onFailedConsumption: Eq,
});

const BracketResultsShow = <E, R>(Show: $S.Show<BracketResult<E, R>>) => $S.struct({
  onSuccesfulConsumption: Show,
  onFailedConsumption: Show,
});

const runBracketTwice = <E>(error: E) => (
  async <R>(bracket: Bracket.Bracket<E, R>): Promise<BracketResults<E, R>> => {
    const onSuccesfulConsumption = await runBracket(TE.of)(bracket);
    const onFailedConsumption = await runBracket(constant(TE.left<E, R>(error)))(bracket);
    return {onSuccesfulConsumption, onFailedConsumption};
  }
);

const equivalence = <E, R>(
  EqR: $E.Eq<R>,
  EqE: $E.Eq<E>,
  ShowR: $S.Show<R> = ShowUnknown,
  ShowE: $S.Show<E> = ShowUnknown,
) => {
  const eq = eqBy(
    BracketResultsEq(BracketResultEq(EqE, EqR)),
    BracketResultsShow(BracketResultShow(ShowE, ShowR))
  );

  return (e: E) => (a: Bracket.Bracket<E, R>, b: Bracket.Bracket<E, R>) => (
    Promise.all([runBracketTwice(e)(a), runBracketTwice(e)(b)])
    .then(([resultA, resultB]) => eq(resultA, resultB))
  );
};

type Err = {error: string};
const ErrEq: $E.Eq<Err> = $E.struct({error: Str.Eq});
const ErrShow: $S.Show<Err> = ({show: (e) => `Err(${Str.Show.show(e.error)})`});
const ErrArb = FC.string().map((s): Err => ({error: s}));

const StringFunctionArb = FC.tuple(FC.nat({max: 10}), FC.string({maxLength: 3})).map(([n, sep]) => (
  (s: string) => (s + sep).repeat(n)
));

const BracketFunctionArb = StringFunctionArb.map(f => (s: string) => (
  Bracket.of<Err, string>(f(s))
));

const TaskEitherErrArb = <T>(ValueArb: FC.Arbitrary<T>) => (
  FC.tuple(ValueArb, ErrArb, FC.boolean(), FC.nat({max: 10})).map(([r, e, fail, delay]) => pipe(
    fail ? TE.left<Err, T>(e) : TE.of<Err, T>(r),
    delay > 0 ? T.delay(delay) : identity,
  ))
);

const BracketArb = <R>(ResourceArb: FC.Arbitrary<R>) => FC.tuple(
  TaskEitherErrArb(ResourceArb),
  TaskEitherErrArb(FC.nat()),
).map(([acquire, dispose]) => Bracket.bracket(acquire, constant(dispose)));

const testErr = {error: 'test error'};

const strErrEquivalence = equivalence(Str.Eq, ErrEq, Str.Show, ErrShow)(testErr);

const recordErrEquivalence = equivalence(
  R.getEq(Str.Eq),
  ErrEq,
  R.getShow(Str.Ord)(Str.Show),
  ErrShow
)(testErr);

const noDispose = <E>() => TE.of<E, undefined>(undefined);
type Strstr = (str: string) => string;
const composeStrstr = (f: Strstr) => (g: Strstr) => (x: string) => f(g(x));

//
// Monadic laws
//

hold('Functor identity', FC.asyncProperty(
  BracketArb(FC.string()),
  (mx) => strErrEquivalence(
    Bracket.Functor.map(mx, identity),
    mx
  )
));

hold('Functor composition', FC.asyncProperty(
  BracketArb(FC.string()),
  StringFunctionArb,
  StringFunctionArb,
  (mx, f, g) => strErrEquivalence(
    Bracket.Functor.map(Bracket.Functor.map(mx, f), g),
    Bracket.Functor.map(mx, composeStrstr(g)(f))
  )
));

hold('Apply composition', FC.asyncProperty(
  BracketArb(FC.string()),
  BracketArb(StringFunctionArb),
  BracketArb(StringFunctionArb),
  (mx, mf, mg) => strErrEquivalence(
    Bracket.Apply.ap(mg, Bracket.Apply.ap(mf, mx)),
    Bracket.Apply.ap(Bracket.Apply.ap(Bracket.Apply.map(mg, composeStrstr), mf), mx)
  )
));

hold('Applicative identity', FC.asyncProperty(
  BracketArb(FC.string()),
  (mx) => strErrEquivalence(
    Bracket.Applicative.ap(Bracket.Applicative.of<Err, Strstr>(identity), mx),
    mx,
  )
));

hold('Applicative homomorphism', FC.asyncProperty(
  FC.string(),
  StringFunctionArb,
  (x, f) => strErrEquivalence(
    Bracket.Applicative.ap(Bracket.of<Err, Strstr>(f), Bracket.Applicative.of(x)),
    Bracket.Applicative.of(f(x))
  )
));

hold('Applicative interchange', FC.asyncProperty(
  FC.string(),
  BracketArb(StringFunctionArb),
  (x, mf) => strErrEquivalence(
    Bracket.Applicative.ap(mf, Bracket.Applicative.of(x)),
    Bracket.Applicative.ap(Bracket.Applicative.of<Err, (f: Strstr) => string>(f => f(x)), mf)
  )
));

hold('Applicative-derived Functor', FC.asyncProperty(
  BracketArb(FC.string()),
  StringFunctionArb,
  (mx, f) => strErrEquivalence(
    Bracket.Applicative.map(mx, f),
    Bracket.Applicative.ap(Bracket.Applicative.of<Err, Strstr>(f), mx)
  )
));

hold('ApplyPar composition', FC.asyncProperty(
  BracketArb(FC.string()),
  BracketArb(StringFunctionArb),
  BracketArb(StringFunctionArb),
  (mx, mf, mg) => strErrEquivalence(
    Bracket.ApplyPar.ap(mg, Bracket.ApplyPar.ap(mf, mx)),
    Bracket.ApplyPar.ap(Bracket.ApplyPar.ap(Bracket.ApplyPar.map(mg, composeStrstr), mf), mx)
  )
));

hold('ApplicativePar identity', FC.asyncProperty(
  BracketArb(FC.string()),
  (mx) => strErrEquivalence(
    Bracket.ApplicativePar.ap(Bracket.ApplicativePar.of<Err, Strstr>(identity), mx),
    mx,
  )
));

hold('ApplicativePar homomorphism', FC.asyncProperty(
  FC.string(),
  StringFunctionArb,
  (x, f) => strErrEquivalence(
    Bracket.ApplicativePar.ap(Bracket.of<Err, Strstr>(f), Bracket.ApplicativePar.of(x)),
    Bracket.ApplicativePar.of(f(x))
  )
));

hold('ApplicativePar interchange', FC.asyncProperty(
  FC.string(),
  BracketArb(StringFunctionArb),
  (x, mf) => strErrEquivalence(
    Bracket.ApplicativePar.ap(mf, Bracket.ApplicativePar.of(x)),
    Bracket.ApplicativePar.ap(Bracket.ApplicativePar.of<Err, (f: Strstr) => string>(f => f(x)), mf)
  )
));

hold('ApplicativePar-derived Functor', FC.asyncProperty(
  BracketArb(FC.string()),
  StringFunctionArb,
  (mx, f) => strErrEquivalence(
    Bracket.ApplicativePar.map(mx, f),
    Bracket.ApplicativePar.ap(Bracket.ApplicativePar.of<Err, Strstr>(f), mx)
  )
));

hold('Chain associativity', FC.asyncProperty(
  BracketArb(FC.string()),
  BracketFunctionArb,
  BracketFunctionArb,
  (mx, fm, gm) => strErrEquivalence(
    Bracket.Chain.chain(Bracket.Chain.chain(mx, fm), gm),
    Bracket.Chain.chain(mx, x => Bracket.Chain.chain(fm(x), gm))
  )
));

hold('Monad left identity', FC.asyncProperty(
  FC.string(),
  BracketFunctionArb,
  (x, fm) => strErrEquivalence(
    Bracket.Monad.chain(Bracket.Monad.of(x), fm),
    fm(x)
  )
));

hold('Monad right identity', FC.asyncProperty(
  BracketArb(FC.string()),
  (mx) => strErrEquivalence(
    Bracket.Monad.chain(mx, x => Bracket.Monad.of(x)),
    mx
  )
));

hold('Monad-derived Functor', FC.asyncProperty(
  BracketArb(FC.string()),
  StringFunctionArb,
  (mx, f) => strErrEquivalence(
    Bracket.Monad.map(mx, f),
    Bracket.Monad.chain(mx, x => Bracket.Monad.of(f(x)))
  )
));

hold('Monad-derived Apply', FC.asyncProperty(
  BracketArb(FC.string()),
  BracketArb(StringFunctionArb),
  (mx, mf) => strErrEquivalence(
    Bracket.Monad.ap(mf, mx),
    Bracket.Monad.chain(mf, f => Bracket.Monad.map(mx, f))
  )
));

//
// Custom properties
//

hold('bracket(acquire, K(dispose)) = bracket(acquire, K(dispose))', FC.asyncProperty(
  TaskEitherErrArb(FC.string()),
  TaskEitherErrArb(FC.nat()),
  (acquire, dispose) => strErrEquivalence(
    Bracket.bracket(acquire, constant(dispose)),
    Bracket.bracket(acquire, constant(dispose))
  )
));

hold('of(x) = bracket(TE.of(x), noDispose)', FC.asyncProperty(
  FC.string(),
  (x) => strErrEquivalence(
    Bracket.of(x),
    Bracket.bracket<Err, string>(TE.of(x), noDispose)
  )
));

hold('ap(mx)(mf) = apPar(mx)(mf)', FC.asyncProperty(
  BracketArb(FC.string()),
  BracketArb(StringFunctionArb),
  (mx, mf) => strErrEquivalence(
    Bracket.ap(mx)(mf),
    Bracket.apPar(mx)(mf)
  )
));

hold('sequenceS({a: ma, b: mb}) = sequenceSPar({a: ma, b: mb})', FC.asyncProperty(
  BracketArb(FC.string()),
  BracketArb(FC.string()),
  (ma, mb) => recordErrEquivalence(
    Bracket.sequenceS({a: ma, b: mb}),
    Bracket.sequenceSPar({a: ma, b: mb})
  )
));
