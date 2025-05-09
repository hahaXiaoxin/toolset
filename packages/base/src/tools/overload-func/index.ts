import type { TAnyFunc, TAppend, TLastBeforeTypes, TLastType } from '$/types/base';
import { isPromise, objectFind } from '$/utils';

interface BaseTypeMap {
  string: string;
  number: number;
  boolean: boolean;
  object: object;
  function: (...args: any[]) => any;
  any: any;
  unknown: unknown;
  undefined: undefined;
  void: void;
  null: null;
}

/** promise 字符串的实际类型 */
type PromiseArgsType<T> = T extends `promise<${infer K}>` | `Promise<${infer K}>`
  ? K extends keyof BaseTypeMap
    ? Promise<BaseTypeMap[K]>
    : Promise<any>
  : T extends `promise` | `Promise`
    ? Promise<void>
    : never;

/** promise 类型 */
type PromiseTypeMap = {
  [K in `promise<${keyof BaseTypeMap}>` | `Promise<${keyof BaseTypeMap}>`]: PromiseArgsType<K>;
};

type BasePromiseTypeMap = BaseTypeMap & PromiseTypeMap;

/** 获取数组和剩余数组的实际类型 */
type ArrayArgsType<T> = T extends `...${infer K}` | `${infer K}[]`
  ? K extends keyof BasePromiseTypeMap
    ? BasePromiseTypeMap[K][]
    : any[]
  : any[];

/** 剩余类型 */
type ExtendsTypeMap = {
  [K in `...${keyof BasePromiseTypeMap}`]: ArrayArgsType<K>;
};

/** 数组类型 */
type ArrayTypeMap = {
  [K in `${keyof BasePromiseTypeMap}[]`]: ArrayArgsType<K>;
};

/** 支持的类型映射 */
type TypeMap = BasePromiseTypeMap & ExtendsTypeMap & ArrayTypeMap;

/** 支持的类型 */
type TypeMapKeys = keyof TypeMap;

/** 辅助包装类型 */
interface Pick<T extends any[]> { _: T }

/** 获取类型字符对应的实际类型 */
// @ts-expect-error H 是可以正常索引 TypeMap 的, 否则前置的类型就会报错
type GetCompType<H> = H extends keyof ExtendsTypeMap ? Pick<TypeMap[H]> : TypeMap[H];

/** 函数类型信息 */
type FuncTypes<A extends any[], R extends any[] = []> = A extends [infer H, ...infer L]
  ? FuncTypes<L, TAppend<GetCompType<H>, R>>
  : R;

/** 判断函数是否在多态映射中 */
type FuncInMap<F extends TAnyFunc, M extends TAnyFunc> = M extends F ? F : never;

/** 参数解析 */
type ArgsParse<T extends any[], R extends any[] = []> = T extends [infer H, ...infer L]
  ? H extends Pick<infer V>
    ? [...R, ...V]
    : ArgsParse<L, TAppend<H, R>>
  : R;

/** 回调函数类型 */
type Callback<T extends any[]> = (...args: ArgsParse<TLastBeforeTypes<T>>) => TLastType<T, void>;

interface RegisterFuncOptions<
  A extends TypeMapKeys[] = TypeMapKeys[],
  RT extends TypeMapKeys = 'void',
  T extends any[] = FuncTypes<TAppend<RT, A>>,
  F extends Callback<T> = Callback<T>,
  M extends TAnyFunc = TAnyFunc,
> {
  matchFunc?: (args: any[], types: TAppend<RT, A>) => boolean;
  returnType?: RT;
  types?: A;
  func: FuncInMap<F, M>;
}

interface RegisterFunc<M extends TAnyFunc> {
  /**
   * 注册一个重载实现
   *
   * @warning promise 只判断是否是 promise, 对 promise 的返回值不进行校验, 所以 Promise\<number> 和 Promise\<string> 在函数匹配时是等价的
   */
  <
    A extends TypeMapKeys[] = TypeMapKeys[],
    RT extends TypeMapKeys = 'void',
    T extends any[] = FuncTypes<TAppend<RT, A>>,
    F extends Callback<T> = Callback<T>,
  >(options: RegisterFuncOptions<A, RT, T, F, M>): PolymorphismInstance<M>;

  /**
   * 注册一个重载实现
   *
   * @warning promise 只判断是否是 promise, 对 promise 的返回值不进行校验, 所以 Promise\<number> 和 Promise\<string> 在函数匹配时是等价的
   */
  <
    A extends TypeMapKeys[],
    T extends any[] = FuncTypes<A>,
    F extends Callback<T> = Callback<T>,
  >(func: FuncInMap<F, M>, ...args: A): PolymorphismInstance<M>;

  /**
   * 注册一个重载实现
   *
   * @warning promise 只判断是否是 promise, 对 promise 的返回值不进行校验, 所以 Promise\<number> 和 Promise\<string> 在函数匹配时是等价的
   */
  <
    A extends TypeMapKeys[],
    T extends any[] = FuncTypes<A>,
    F extends Callback<T> = Callback<T>,
  >(func: FuncInMap<F, M>, matchFunc: (args: any[], types: A) => boolean, ...args: A): PolymorphismInstance<M>;
}

interface PolymorphismController<M extends TAnyFunc> {
  register: RegisterFunc<M>;
}

export type PolymorphismInstance<T extends TAnyFunc> = T & PolymorphismController<T>;

interface FuncImpl {
  callback: TAnyFunc;
  matchFunc?: TAnyFunc;
}

interface FuncImplInfo {
  types: TypeMapKeys[];
  returnType: string;
  base?: FuncImpl;
  match?: FuncImpl;
}

type FuncImplInfoMap = Record<string, FuncImplInfo>;

function joinTypes(types: string[]) {
  return types.join('|');
}

function callFuncImpl(funcImplInfo: FuncImplInfo, args: any[]) {
  const { types, match: matchImpl, base: baseImpl } = funcImplInfo;
  if (matchImpl) {
    const matchResult = matchImpl.matchFunc!(args, types);
    if (matchResult) {
      return matchImpl.callback(...args);
    }
  }
  if (!baseImpl) {
    throw new TypeError('没有找到匹配的函数');
  }
  return baseImpl.callback(...args);
}

function getType(value: any): TypeMapKeys {
  if (isPromise(value)) {
    return 'promise<any>';
  }
  if (Array.isArray(value)) {
    return `${getType(value[0])}[]` as TypeMapKeys;
  }
  return typeof value as TypeMapKeys;
}

function getArgsType(args: any[]): TypeMapKeys[] {
  return args.map(getType);
}

function typeEq(t1: string, t2: string) {
  if (t1.startsWith('promise')) {
    return t2.toLowerCase().startsWith('promise');
  }
  return t1 === t2;
}

export function typesMatch(types: TypeMapKeys[], inputTypes: TypeMapKeys[]) {
  const hasExtendsArgs = joinTypes(types).includes('...');
  // 如果存在 ... 类型的参数, 则需要忽略
  const typesLength = types.length - (hasExtendsArgs ? 1 : 0);
  // 如果 types 长度大于 inputTypes 长度, 则不匹配
  if (typesLength > inputTypes.length)
    return false;
  // 如果不存在 ... 类型的参数, 并且 types 长度不等于 inputTypes 长度, 则不匹配
  if (!hasExtendsArgs && typesLength !== inputTypes.length) {
    return false;
  }
  for (let i = 0, j = 0, t = types[i], it = inputTypes[j]; j < inputTypes.length; t = types[i], it = inputTypes[++j]) {
    if (t === 'any') {
      ++i;
      continue;
    }
    if (t.startsWith('...')) {
      const [, type] = t.split('...');
      if (!typeEq(type, it))
        return false;
      continue;
    }
    if (!typeEq(t, it)) {
      return false;
    }
    ++i;
  }
  return true;
}

function findFuncImplInfo(funcImplInfoMap: FuncImplInfoMap, types?: TypeMapKeys[], args?: any[]): FuncImplInfo | undefined {
  // 存在 args 则直接使用 args 的实际类型匹配
  if (args) {
    const argsTypes = getArgsType(args);
    return objectFind(funcImplInfoMap, ({ types }: FuncImplInfo) => typesMatch(types, argsTypes));
  }
  if (!types)
    return;
  const _types = joinTypes(types);
  return funcImplInfoMap[_types];
}

/**
 * 对register的args进行处理，返回匹配函数以及allTypes，参数归一化
 */
function dealRegisterArgs(args: any[]): {
  matchFunc?: ((args: any[], types: TypeMapKeys[]) => boolean);
  allTypes: TypeMapKeys[];
  func: TAnyFunc;
} {
  const [funcOrOptions, ...restArgs] = args;

  if (typeof funcOrOptions !== 'object' && typeof funcOrOptions !== 'function') {
    throw new TypeError('第一个参数必须为 function 类型，或者为可识别的 配置项 类型');
  }

  // 如果第一个参数是对象，则当作配置项直接使用
  if (typeof funcOrOptions === 'object' && funcOrOptions !== null) {
    const func = funcOrOptions.func;

    if (typeof func !== 'function') {
      throw new TypeError('func 必须为 function 类型');
    }

    const matchFunc = (funcOrOptions as RegisterFuncOptions).matchFunc as ((args: any[], types: TypeMapKeys[]) => boolean);
    const allTypes: TypeMapKeys[] = [];

    if (funcOrOptions.types) {
      allTypes.push(...funcOrOptions.types);
    }

    // 有则添加，无则加入void
    if (funcOrOptions.returnType) {
      allTypes.push(funcOrOptions.returnType);
    }
    else {
      allTypes.push('void');
    }

    return {
      matchFunc,
      allTypes,
      func,
    };
  }

  let matchFunc: ((args: any[], types: TypeMapKeys[]) => boolean) | undefined; // 参数匹配函数

  const func = funcOrOptions;
  const [matchFuncOrType, ...restTypes] = restArgs;
  const allTypes = restTypes;

  if (typeof matchFuncOrType === 'function') {
    matchFunc = matchFuncOrType;
  }
  else {
    if (matchFuncOrType) {
      allTypes.unshift(matchFuncOrType);
    }
  }

  return {
    matchFunc,
    allTypes,
    func,
  };
};

function getController(funcImplInfoMap: FuncImplInfoMap): PolymorphismController<any> {
  return {
    register(...args: any[]) {
      const { matchFunc, allTypes, func } = dealRegisterArgs(args);

      if (allTypes.some(item => typeof item !== 'string')) {
        throw new TypeError('剩余参数必须为 string 类型');
      }

      const transformType = (type: TypeMapKeys) => {
        if (type === 'void')
          return 'undefined';
        if (type === 'unknown')
          return 'any';
        return type;
      };

      const _allTypes = allTypes.map(transformType);

      const _types = _allTypes.slice(0, -1);
      const _returnType = _allTypes[_allTypes.length - 1];

      const funcImpl = {
        callback: func,
        matchFunc,
      };

      const implType = typeof matchFunc === 'function' ? 'match' : 'base';

      const oldFuncImplInfo = findFuncImplInfo(funcImplInfoMap, _types);
      if (oldFuncImplInfo?.[implType]) {
        throw new TypeError(`当前多态已实现, 类型: ${oldFuncImplInfo.types}`);
      }

      const funcImplInfo = {
        types: _types,
        returnType: _returnType,
        [implType]: funcImpl,
      };

      funcImplInfoMap[joinTypes(_types)] = Object.assign({}, funcImplInfoMap[joinTypes(_types)], funcImplInfo);
      return this as PolymorphismInstance<any>;
    },
  };
}

/**
 * 创建一个支持重载的函数
 */
export function createOverloadFunc<T extends TAnyFunc = (...args: any) => any>(): PolymorphismInstance<T> {
  const funcImplInfoMap: FuncImplInfoMap = {};

  const controller = getController(funcImplInfoMap);

  return new Proxy((...args: any[]) => {
    const funcImplInfo = findFuncImplInfo(funcImplInfoMap, undefined, args);

    if (!funcImplInfo) {
      throw new TypeError(`没有找到匹配的函数`);
    }

    const result = callFuncImpl(funcImplInfo, args);

    return result;
  }, {
    get(target, prop, receiver) {
      if (prop in controller) {
        return (controller as any)[prop].bind(receiver);
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as any;
}

export { createOverloadFunc as createPolymorphismFunc };
