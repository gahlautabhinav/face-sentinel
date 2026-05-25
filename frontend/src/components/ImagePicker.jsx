import { useRef, useState } from 'react'

export default function ImagePicker({ onFile, label = 'Select image (JPEG / PNG, max 5MB)' }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)

  function handleChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    onFile(file)
  }

  return (
    <div className="field">
      <label>{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleChange}
        style={{ padding: '6px' }}
      />
      <div className="preview-box">
        {preview
          ? <img src={preview} alt="preview" />
          : <span>No image selected</span>
        }
      </div>
    </div>
  )
}
