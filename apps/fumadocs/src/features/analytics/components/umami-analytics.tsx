import Script from "next/script";

const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim();
const umamiScriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL?.trim();
const umamiHostUrl = process.env.NEXT_PUBLIC_UMAMI_HOST_URL?.trim();
const umamiDomains = process.env.NEXT_PUBLIC_UMAMI_DOMAINS?.trim();
const umamiTag = process.env.NEXT_PUBLIC_UMAMI_TAG?.trim();

const UmamiAnalytics = () => {
  if (!umamiWebsiteId || !umamiScriptUrl) {
    return null;
  }

  return (
    <Script
      data-domains={umamiDomains}
      data-host-url={umamiHostUrl}
      data-tag={umamiTag}
      data-website-id={umamiWebsiteId}
      id="umami-analytics"
      src={umamiScriptUrl}
      strategy="afterInteractive"
    />
  );
};

export default UmamiAnalytics;
