import React from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useImagePaste(
  _textareaRef: React.RefObject<HTMLTextAreaElement | null>, // Kept in signature for compatibility
  _value: string, // Kept in signature for compatibility
  _onChange: (newValue: string) => void, // Kept in signature for compatibility
  notebookId: string
) {
  const isImageFile = (file: File): boolean => {
    if (file.type.startsWith('image/')) return true;
    // WebView2 copy-paste fallback check for Windows File Explorer copied images
    const extension = file.name.split('.').pop()?.toLowerCase();
    return !!extension && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extension);
  };

  const handleImageFile = async (textarea: HTMLTextAreaElement, file: File) => {
    if (!isImageFile(file)) return;

    try {
      console.log('useImagePaste: Processing image file:', file.name, 'Size:', file.size);
      const buffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      let fileExtension = 'png';
      const nameParts = file.name.split('.');
      if (nameParts.length > 1) {
        fileExtension = nameParts[nameParts.length - 1].toLowerCase();
      } else {
        const mimeParts = file.type.split('/');
        if (mimeParts.length > 1) {
          fileExtension = mimeParts[1];
        }
      }

      if (fileExtension === 'jpeg') fileExtension = 'jpg';

      console.log('useImagePaste: Saving image via Rust...');
      const relativePath: string = await invoke('save_pasted_image', {
        notebookId,
        imageData: Array.from(uint8Array),
        fileExtension,
      });

      const imageMarkdown = `![${file.name}](${relativePath})`;
      console.log('useImagePaste: Image saved. Inserting markdown:', imageMarkdown);

      textarea.focus();
      try {
        document.execCommand('insertText', false, imageMarkdown);
      } catch (err) {
        console.error('execCommand failed for image paste, falling back:', err);
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        const newValue = value.slice(0, start) + imageMarkdown + value.slice(end);
        
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(textarea, newValue);
        } else {
          textarea.value = newValue;
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.setSelectionRange(start + imageMarkdown.length, start + imageMarkdown.length);
      }
    } catch (err) {
      console.error('Failed to save and insert image:', err);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    console.log('useImagePaste: Paste event triggered on textarea.');
    const textarea = e.currentTarget;

    // 1. Check for standard clipboard items (like screenshots)
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/') || item.kind === 'file') {
          const file = item.getAsFile();
          if (file && isImageFile(file)) {
            e.preventDefault();
            handleImageFile(textarea, file);
            return;
          }
        }
      }
    }

    // 2. Check for copied image files from Windows File Explorer
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (isImageFile(file)) {
          e.preventDefault();
          handleImageFile(textarea, file);
          return;
        }
      }
    }
  };

  const onDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    console.log('useImagePaste: Drop event triggered on textarea.');
    const textarea = e.currentTarget;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (isImageFile(file)) {
        e.preventDefault();
        handleImageFile(textarea, file);
        return;
      }
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    const types = e.dataTransfer?.types;
    if (types && Array.from(types).includes('Files')) {
      e.preventDefault();
    }
  };

  return { onPaste, onDrop, onDragOver };
}
