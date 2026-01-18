/// <reference types="node" />

declare module '*.png?asset' {
  const content: string
  export default content
}

declare module '*.png' {
  const content: string
  export default content
}
