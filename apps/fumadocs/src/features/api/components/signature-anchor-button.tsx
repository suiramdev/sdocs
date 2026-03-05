"use client";

import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { Check, LinkIcon } from "lucide-react";

interface SignatureAnchorButtonProps {
  anchor: string;
  signature: string;
}

const getAnchorUrl = (anchor: string): string => {
  const url = new URL(window.location.href);
  url.hash = anchor;

  return url.toString();
};

export const SignatureAnchorButton = ({
  anchor,
  signature,
}: SignatureAnchorButtonProps) => {
  const [checked, onClick] = useCopyButton(() =>
    navigator.clipboard.writeText(getAnchorUrl(anchor))
  );

  return (
    <button
      aria-label={`Copy link to ${signature}`}
      className="api-signature-anchor-button"
      onClick={onClick}
      title="Copy anchor link"
      type="button"
    >
      {checked ? <Check /> : <LinkIcon />}
    </button>
  );
};
