import { useState } from 'react'

interface VersionsProps {
  highContrast?: boolean
}

function Versions({ highContrast = false }: VersionsProps): React.JSX.Element {
  const [versions] = useState(window.electron.process.versions)

  return (
    <ul className={`versions${highContrast ? ' high-contrast' : ''}`}>
      <li className={`electron-version${highContrast ? ' high-contrast' : ''}`}>
        Electron v{versions.electron}
      </li>
      <li className={`chrome-version${highContrast ? ' high-contrast' : ''}`}>
        Chromium v{versions.chrome}
      </li>
      <li className={`node-version${highContrast ? ' high-contrast' : ''}`}>
        Node v{versions.node}
      </li>
    </ul>
  )
}

export default Versions
