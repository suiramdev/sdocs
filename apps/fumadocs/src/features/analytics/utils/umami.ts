type UmamiEventValue = boolean | number | string;

export type UmamiEventData = Record<string, UmamiEventValue>;

export const trackUmamiEvent = (
  eventName: string,
  eventData?: UmamiEventData
): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.umami?.track(eventName, eventData);
};
