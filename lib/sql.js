'use strict'

const { toLiteral, toName, escapeDoubleQuotes } = require('./format')
const { isArray } = Array

const joinPrefixed = (prefix, xs, sep = ',') => xs.length === 0 ? '' : `${prefix}${xs.join(sep + prefix)}`

class SimpleSql {
  constructor (text) {
    this.text = text
  }

  toJSON () {
    throw new Error('Not allowed to stringify a SimpleSql')
  }
}

const sql = ({ raw }, ...params) => {
  let text = raw[0]

  for (let i = 0; i < params.length;) {
    const param = params[i]

    if (param instanceof SimpleSql) {
      text += param.text
    } else if (raw[i].endsWith('"') && raw[i + 1].startsWith('"')) {
      text += isArray(param)
        ? param.map(escapeDoubleQuotes).join('","')
        : escapeDoubleQuotes(param)
    } else {
      text += toLiteral(param)
    }
    text += raw[++i]
  }

  return new SimpleSql(text)
}

sql._ = new SimpleSql('')

sql.raw = source => {
  if (!source) return sql._
  if (source instanceof SimpleSql) return source
  return new SimpleSql(source)
}

sql.names = (names, sep = ',') => new SimpleSql(names.map(toName).join(sep))

sql.values = (values, sep = ',') => new SimpleSql(values.map(toLiteral).join(sep))

sql.cond = obj => {
  const text = Object.keys(obj)
  .map(key => {
    const name = toName(key)
    const val = obj[key]
    return val instanceof SimpleSql
      ? `(${name} ${val.text})`
      : `${name} = ${toLiteral(val)}`
  })
  .join(' AND ')

  return new SimpleSql(text)
}

sql.sets = obj => {
  const left = Object.keys(obj).map(toName)
  const right = Object.values(obj).map(toLiteral)
  return new SimpleSql(`(${left}) = (${right})`)
}

sql.update = ({
  table, // string
  where, // SimpleSql | object
  set, // object
  skipEqual = false,
  returning = undefined, // '*' | string[] | undefined
}) => {
  const leftSide = Object.keys(set).map(toName).join()
  const rightSide = Object.values(set).map(toLiteral).join()

  const conditionSql = where instanceof SimpleSql ? where : sql.cond(where)

  let text = `UPDATE ${toName(table)}\n`
  text += `SET (${leftSide}) = (${rightSide})\n`
  text += `WHERE (${conditionSql.text})\n`

  if (skipEqual) {
    text += `  AND (${leftSide}) IS DISTINCT FROM (${rightSide})\n`
  }

  if (returning) {
    text += 'RETURNING '
    text += returning === '*' ? '*' : returning.map(toName)
    text += '\n'
  }

  return new SimpleSql(text)
}

sql.insert = ({
  into, // string
  columns = undefined, // string[] | undefined
  data, // object | object[]
  onConflict = undefined, // string | string[] | undefined
  update = undefined, // boolean | string[] | undefined
  skipEqual = false, // boolean
  returning = undefined, // '*' | string[] | undefined
}) => {
  if (isArray(data)) {
    if (!columns) throw new TypeError('`columns` required when `data` is an array')
    if (data.length === 0) throw new TypeError('inserting data is empty')
  }
  if (onConflict == null !== update == null) {
    throw new TypeError('options `onConflict` and `update` require each other')
  }
  if (skipEqual && !onConflict) {
    throw new TypeError('options `skipEqual` requires options `onConflict`')
  }

  let valuesBody

  if (columns) {
    const toCSV = obj => columns.map(k => toLiteral(obj[k])).join(',')
    valuesBody = isArray(data) ? data.map(toCSV).join('),\n(') : toCSV(data)
  } else {
    columns = Object.keys(data)
    valuesBody = Object.values(data).map(toLiteral).join(',')
  }

  let text = `INSERT INTO ${toName(into)} t (${columns.map(toName)}) VALUES\n(${valuesBody})\n`

  if (onConflict) {
    const conflictIdentifiers = isArray(onConflict) ? onConflict : [onConflict]

    if (update === true) {
      update = columns.filter(col => !conflictIdentifiers.includes(col))
    }

    if (update && update.length === 0) {
      if (skipEqual) {
        update = false
      } else {
        throw new Error('no columns to update')
      }
    }

    text += `ON CONFLICT (${conflictIdentifiers.map(toName)}) DO ${update ? 'UPDATE' : 'NOTHING'}\n`

    if (update) {
      const colNames = update.map(toName)

      const excluded = joinPrefixed('Excluded.', colNames)

      text += `SET (${colNames}) = (${excluded})\n`

      if (skipEqual) {
        text += `WHERE (${joinPrefixed('t.', colNames)}) IS DISTINCT FROM (${excluded})\n`
      }
    }
  }

  if (returning) {
    text += 'RETURNING '
    text += returning === '*' ? '*' : returning.map(toName)
    text += '\n'
  }

  return new SimpleSql(text)
}

module.exports = {
  sql,
  SimpleSql,
}
