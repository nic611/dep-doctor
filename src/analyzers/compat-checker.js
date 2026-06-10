import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// Deprecated React 16 API patterns (ported from audit-react16-api.sh)
const REACT_16_PATTERNS = [
  { pattern: /ReactDOM\.render\s*\(/, api: 'ReactDOM.render', replacement: 'createRoot().render()', severity: 'critical' },
  { pattern: /ReactDOM\.hydrate\s*\(/, api: 'ReactDOM.hydrate', replacement: 'hydrateRoot()', severity: 'critical' },
  { pattern: /ReactDOM\.unmountComponentAtNode/, api: 'unmountComponentAtNode', replacement: 'root.unmount()', severity: 'critical' },
  { pattern: /ReactDOM\.findDOMNode/, api: 'findDOMNode', replacement: 'useRef', severity: 'critical' },
  { pattern: /componentWillMount\s*[({]/, api: 'componentWillMount', replacement: 'useEffect / constructor', severity: 'high' },
  { pattern: /componentWillReceiveProps\s*[({]/, api: 'componentWillReceiveProps', replacement: 'getDerivedStateFromProps / useEffect', severity: 'high' },
  { pattern: /componentWillUpdate\s*[({]/, api: 'componentWillUpdate', replacement: 'getSnapshotBeforeUpdate / useEffect', severity: 'high' },
  { pattern: /UNSAFE_componentWillMount/, api: 'UNSAFE_componentWillMount', replacement: 'useEffect', severity: 'medium' },
  { pattern: /UNSAFE_componentWillReceiveProps/, api: 'UNSAFE_componentWillReceiveProps', replacement: 'getDerivedStateFromProps', severity: 'medium' },
  { pattern: /UNSAFE_componentWillUpdate/, api: 'UNSAFE_componentWillUpdate', replacement: 'getSnapshotBeforeUpdate', severity: 'medium' },
  { pattern: /React\.createFactory/, api: 'React.createFactory', replacement: 'React.createElement / JSX', severity: 'high' },
  { pattern: /React\.createClass/, api: 'React.createClass', replacement: 'class extends Component / function', severity: 'critical' },
  { pattern: /PropTypes\s*=\s*require.*prop-types/, api: 'PropTypes (legacy import)', replacement: 'TypeScript / prop-types package', severity: 'low' },
  { pattern: /this\.refs\.\w+/, api: 'string refs (this.refs)', replacement: 'React.createRef / useRef', severity: 'high' },
  { pattern: /ref\s*=\s*["']\w+["']/, api: 'string ref attribute', replacement: 'callback ref / useRef', severity: 'high' },
  { pattern: /childContextTypes/, api: 'legacy context (childContextTypes)', replacement: 'React.createContext', severity: 'high' },
  { pattern: /getChildContext\s*\(/, api: 'legacy context (getChildContext)', replacement: 'Context.Provider', severity: 'high' },
  { pattern: /contextTypes\s*=/, api: 'legacy context (contextTypes)', replacement: 'useContext', severity: 'high' },
];

// React Router v5 patterns
const ROUTER_V5_PATTERNS = [
  { pattern: /<Switch[\s>]/, api: '<Switch>', replacement: '<Routes>', severity: 'critical' },
  { pattern: /useHistory\s*\(/, api: 'useHistory', replacement: 'useNavigate', severity: 'high' },
  { pattern: /history\.push\s*\(/, api: 'history.push', replacement: 'navigate()', severity: 'high' },
  { pattern: /component=\{/, api: 'Route component={...}', replacement: 'Route element={<.../>}', severity: 'high' },
  { pattern: /<Redirect[\s>]/, api: '<Redirect>', replacement: '<Navigate>', severity: 'high' },
  { pattern: /withRouter\s*\(/, api: 'withRouter HOC', replacement: 'useNavigate + useParams', severity: 'medium' },
];

// Webpack 4→5 patterns
const WEBPACK_4_PATTERNS = [
  { pattern: /contentBase\s*:/, api: 'devServer.contentBase', replacement: 'devServer.static', severity: 'critical' },
  { pattern: /node\s*:\s*\{[^}]*process/, api: 'node.process polyfill', replacement: 'resolve.fallback + ProvidePlugin', severity: 'high' },
  { pattern: /node\s*:\s*\{[^}]*Buffer/, api: 'node.Buffer polyfill', replacement: 'resolve.fallback + ProvidePlugin', severity: 'high' },
  { pattern: /module\.loaders/, api: 'module.loaders', replacement: 'module.rules', severity: 'critical' },
  { pattern: /require\.ensure/, api: 'require.ensure', replacement: 'import()', severity: 'high' },
];

export function checkCompatibility(projectPath, upgradeTargets = ['react', 'react-router-dom', 'webpack']) {
  const findings = [];
  const sourceFiles = collectSourceFiles(projectPath);

  for (const filePath of sourceFiles) {
    const content = readFileSync(filePath, 'utf8');
    const relativePath = filePath.replace(projectPath + '/', '');
    const lines = content.split('\n');

    const patterns = [];
    if (upgradeTargets.includes('react')) patterns.push(...REACT_16_PATTERNS);
    if (upgradeTargets.includes('react-router-dom')) patterns.push(...ROUTER_V5_PATTERNS);
    if (upgradeTargets.includes('webpack')) patterns.push(...WEBPACK_4_PATTERNS);

    for (const { pattern, api, replacement, severity } of patterns) {
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          findings.push({
            file: relativePath,
            line: i + 1,
            api,
            replacement,
            severity,
            code: lines[i].trim(),
          });
        }
      }
    }
  }

  return findings;
}

function collectSourceFiles(dir, files = []) {
  const SKIP = ['node_modules', 'dist', 'build', 'coverage', '.git', '.next'];
  const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (SKIP.includes(entry)) continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        collectSourceFiles(fullPath, files);
      } else if (EXTENSIONS.includes(extname(entry))) {
        files.push(fullPath);
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return files;
}

export function summarizeFindings(findings) {
  const byApi = {};
  for (const f of findings) {
    if (!byApi[f.api]) byApi[f.api] = { count: 0, files: new Set(), severity: f.severity };
    byApi[f.api].count++;
    byApi[f.api].files.add(f.file);
  }

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const effortHours = Math.ceil(criticalCount * 0.5 + highCount * 0.3 + (findings.length - criticalCount - highCount) * 0.1);

  return {
    total: findings.length,
    critical: criticalCount,
    high: highCount,
    uniqueApis: Object.keys(byApi).length,
    uniqueFiles: new Set(findings.map(f => f.file)).size,
    estimatedHours: effortHours,
    byApi,
  };
}
