type UmamiEventValue = boolean | number | string;

type UmamiEventData = Record<string, UmamiEventValue>;

interface UmamiTracker {
  track: (eventName: string, eventData?: UmamiEventData) => void;
}

interface Window {
  umami?: UmamiTracker;
}
