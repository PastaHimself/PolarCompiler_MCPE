declare const console: {
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};
declare const Math: any;
declare const Date: any;
declare const JSON: {
  parse(text: string): any;
  stringify(value: any): string;
};

declare function setTimeout(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): number;
declare function clearTimeout(handle: number): void;

interface Boolean {}
interface Number {}
interface String {}
interface RegExp {}
interface CallableFunction {}
interface NewableFunction {}
interface IArguments {}

interface Object {
  toString(): string;
}

interface Function {
  apply(thisArg: any, args?: any): any;
  call(thisArg: any, ...args: any[]): any;
  bind(thisArg: any, ...args: any[]): any;
}

interface Array<T> {
  length: number;
  [n: number]: T;
  map<U>(callback: (value: T, index: number, array: T[]) => U): U[];
  filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S): S[];
  filter(predicate: (value: T, index: number, array: T[]) => unknown): T[];
  find(predicate: (value: T, index: number, array: T[]) => unknown): T | undefined;
  forEach(callback: (value: T, index: number, array: T[]) => void): void;
  push(...items: T[]): number;
  join(separator?: string): string;
}

interface ReadonlyArray<T> {
  length: number;
  [n: number]: T;
}

interface PromiseLike<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

interface Promise<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2>;
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<T | TResult>;
}

interface PromiseConstructor {
  new <T>(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: any) => void
    ) => void
  ): Promise<T>;
  resolve<T>(value: T | PromiseLike<T>): Promise<T>;
}

declare var Promise: PromiseConstructor;

interface Map<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): this;
  has(key: K): boolean;
}
declare var Map: {
  new <K, V>(): Map<K, V>;
};

interface Set<T> {
  add(value: T): this;
  has(value: T): boolean;
}
declare var Set: {
  new <T>(): Set<T>;
};

type Record<K extends keyof any, T> = {
  [P in K]: T;
};

type Partial<T> = {
  [P in keyof T]?: T[P];
};
