const fs = require('node:fs')
const path = require('node:path')

// Both the dev runner and runtime use this exact-content ownership check.
function retireEntry(commandPath, matches) {
  let before
  try {
    before = fs.lstatSync(commandPath, { bigint: true })
    if (!matches(before, commandPath)) return false
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  const directory = fs.mkdtempSync(path.join(path.dirname(commandPath), '.zkyq-retired-'))
  const held = path.join(directory, 'command')
  try {
    fs.renameSync(commandPath, held)
  } catch (error) {
    fs.rmdirSync(directory)
    if (error.code === 'ENOENT') return false
    throw error
  }
  const captured = fs.lstatSync(held, { bigint: true })
  const owned =
    captured.dev === before.dev && captured.ino === before.ino && matches(captured, held)
  if (!owned) {
    // Restore without overwriting a replacement created at the original path.
    try {
      if (captured.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(held), commandPath)
      else fs.linkSync(held, commandPath)
    } catch (error) {
      throw new Error(`The changed command is preserved at ${held}.`, { cause: error })
    }
  }
  fs.unlinkSync(held)
  fs.rmdirSync(directory)
  return owned
}

function retireGeneratedCommand(commandPath, expectedContent) {
  return retireEntry(
    commandPath,
    (stat, file) => stat.isFile() && fs.readFileSync(file, 'utf8') === expectedContent
  )
}

function retireGeneratedSymlink(commandPath, expectedTarget) {
  return retireEntry(
    commandPath,
    (stat, file) => stat.isSymbolicLink() && fs.readlinkSync(file) === expectedTarget
  )
}

module.exports = { retireGeneratedCommand, retireGeneratedSymlink }
