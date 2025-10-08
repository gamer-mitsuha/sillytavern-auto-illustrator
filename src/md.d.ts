/**
 * TypeScript declaration for markdown file imports
 * Allows importing .md files as strings via webpack asset/source
 */
declare module '*.md' {
  const content: string;
  export default content;
}
