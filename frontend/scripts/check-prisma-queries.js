/**
 * Check for problematic Prisma query patterns
 * Prevents: { not: null } on Int fields
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const SRC_DIR = path.join(__dirname, '..', 'src')
const ALLOWLIST = [
  // Add file paths that are known to be safe (e.g., if using a wrapper)
]

function findFiles(dir, ext, fileList = []) {
  const files = fs.readdirSync(dir)
  files.forEach((file) => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory() && !filePath.includes('node_modules') && !filePath.includes('.next')) {
      findFiles(filePath, ext, fileList)
    } else if (file.endsWith(ext)) {
      fileList.push(filePath)
    }
  })
  return fileList
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const issues = []

  lines.forEach((line, index) => {
    // Check for { not: null } on Int fields
    // Pattern: fieldName: { not: null } where fieldName is likely an Int
    const notNullPattern = /(\w+):\s*\{\s*not:\s*null\s*\}/g
    let match
    while ((match = notNullPattern.exec(line)) !== null) {
      const fieldName = match[1]
      // Common Int field names that should not use { not: null }
      const intFields = [
        'frequenciaSemanal',
        'tempoAulaMinutos',
        'durationMinutes',
        'orderIndex',
        'year',
        'month',
        'day',
        'hour',
        'minute',
        'count',
        'total',
        'quantity',
        'amount',
        'value',
        'score',
        'grade',
        'rating',
      ]
      if (intFields.some((f) => fieldName.toLowerCase().includes(f.toLowerCase()))) {
        issues.push({
          line: index + 1,
          column: match.index,
          field: fieldName,
          message: `Int field "${fieldName}" uses { not: null }. Use { gt: 0 } or { not: 0 } instead.`,
        })
      }
    }
  })

  return issues
}

function main() {
  console.log('Checking Prisma queries for problematic patterns...\n')
  const tsFiles = findFiles(SRC_DIR, '.ts')
  const tsxFiles = findFiles(SRC_DIR, '.tsx')
  const allFiles = [...tsFiles, ...tsxFiles]

  let totalIssues = 0
  const fileIssues = []

  allFiles.forEach((file) => {
    const relativePath = path.relative(SRC_DIR, file)
    if (ALLOWLIST.includes(relativePath)) {
      return
    }
    const issues = checkFile(file)
    if (issues.length > 0) {
      fileIssues.push({ file: relativePath, issues })
      totalIssues += issues.length
    }
  })

  if (totalIssues > 0) {
    console.error('❌ Found problematic Prisma query patterns:\n')
    fileIssues.forEach(({ file, issues }) => {
      console.error(`  ${file}:`)
      issues.forEach((issue) => {
        console.error(`    Line ${issue.line}: ${issue.message}`)
      })
      console.error('')
    })
    console.error(`Total issues: ${totalIssues}`)
    console.error('\nFix: Replace { not: null } with { gt: 0 } for Int fields (or { not: 0 } if zero is meaningful)')
    process.exit(1)
  } else {
    console.log('✅ No problematic Prisma query patterns found')
    process.exit(0)
  }
}

main()
