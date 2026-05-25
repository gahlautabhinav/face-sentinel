export default function ResultBox({ result }) {
  if (!result) return null

  const cls = result.success === true
    ? 'success'
    : result.success === false
      ? 'error'
      : 'info'

  return (
    <div className={`result ${cls}`}>
      {JSON.stringify(result, null, 2)}
    </div>
  )
}
