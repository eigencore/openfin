import { createContext, type ParentProps, useContext } from "solid-js"

export function createSimpleContext<T, Props extends Record<string, any> = Record<string, any>>(input: {
  name: string
  init: ((input: Props) => T) | (() => T)
}) {
  const ctx = createContext<T>()

  return {
    provider: (props: ParentProps<Props>) => {
      const value = input.init(props as Props)
      return <ctx.Provider value={value}>{props.children}</ctx.Provider>
    },
    use(): T {
      const value = useContext(ctx)
      if (value === undefined) throw new Error(`${input.name} context not found`)
      return value
    },
  }
}
