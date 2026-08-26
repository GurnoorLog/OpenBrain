import type * as React from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'iconify-icon': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          icon?: string
          inline?: boolean
          width?: string | number
          height?: string | number
        },
        HTMLElement
      >
    }
  }
}
