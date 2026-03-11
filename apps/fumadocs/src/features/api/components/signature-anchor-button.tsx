"use client";

import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { Check, LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

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
    <Button
      aria-label={`Copy link to ${signature}`}
      className="h-8 w-8 rounded-md border border-border text-muted-foreground hover:text-foreground"
      onClick={onClick}
      size="icon"
      title="Copy anchor link"
      variant="ghost"
    >
      {checked ? <Check className="size-4" /> : <LinkIcon className="size-4" />}
    </Button>
  );
};
