/**
 * Custom hook for copying text to clipboard with fallback support
 */
import { useState, useCallback } from 'react';
import { CLIPBOARD_NOTIFICATION_DURATION } from '../constants';

/**
 * Hook for copying text to clipboard with modern API and fallback
 * Supports tracking copied state by ID for multiple copy buttons
 *
 * @returns {Object} Object containing copy function and copied state checker
 * @returns {Function} returns.copyToClipboard - Function to copy text (text, id)
 * @returns {Function} returns.isCopied - Check if specific ID was copied
 *
 * @example
 * const { copyToClipboard, isCopied } = useCopyToClipboard();
 *
 * {servers.map(server => (
 *   <button onClick={() => copyToClipboard('text', server.id)}>
 *     {isCopied(server.id) ? 'Copied!' : 'Copy'}
 *   </button>
 * ))}
 */
export function useCopyToClipboard() {
  const [copiedId, setCopiedId] = useState(null);

  const copyToClipboard = useCallback(async (text, id = 'default') => {
    try {
      // Try modern Clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), CLIPBOARD_NOTIFICATION_DURATION);
        return true;
      }

      // Fallback to execCommand for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.top = '0';
      textarea.style.left = '0';

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (successful) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), CLIPBOARD_NOTIFICATION_DURATION);
        return true;
      }

      throw new Error('Copy command failed');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      alert(`Impossibile copiare negli appunti.\nTesto: ${text}\n\nCopia manualmente questo testo.`);
      return false;
    }
  }, []);

  const isCopied = useCallback((id = 'default') => copiedId === id, [copiedId]);

  return { copyToClipboard, isCopied };
}
