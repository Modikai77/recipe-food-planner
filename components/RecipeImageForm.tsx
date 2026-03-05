"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read image"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export function RecipeImageForm({ recipeId, hasImage }: { recipeId: string; hasImage: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function onFileSelected(file?: File | null) {
    if (!file || saving) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image file.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setStatus("Image is too large. Please use an image smaller than 8MB.");
      return;
    }

    setSaving(true);
    setStatus("Saving image...");

    try {
      const imagePath = await fileToDataUrl(file);
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePath }),
      });

      if (!response.ok) {
        setStatus("Failed to save image");
        setSaving(false);
        return;
      }

      setStatus("Image saved");
      router.refresh();
    } catch {
      setStatus("Failed to save image");
    } finally {
      setSaving(false);
      if (uploadRef.current) {
        uploadRef.current.value = "";
      }
      if (cameraRef.current) {
        cameraRef.current.value = "";
      }
    }
  }

  return (
    <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.5rem", maxWidth: 420 }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" onClick={() => uploadRef.current?.click()} disabled={saving}>
          {saving ? "Saving..." : hasImage ? "Change image" : "Add image"}
        </button>
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={saving}>
          {saving ? "Saving..." : "Take photo"}
        </button>
      </div>

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(event) => onFileSelected(event.target.files?.[0])}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(event) => onFileSelected(event.target.files?.[0])}
      />
      {status ? <p className="muted">{status}</p> : null}
    </div>
  );
}
