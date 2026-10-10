import { parseTimeInputValue, toTimeInputValue } from './PracticeTimePicker';

// Roadmap D31: the web build's <input type="time"> speaks "HH:MM".
describe('practice time input values', () => {
  it('writes a time as HH:MM', () => {
    expect(toTimeInputValue({ hour: 6, minute: 5 })).toBe('06:05');
    expect(toTimeInputValue({ hour: 20, minute: 30 })).toBe('20:30');
  });

  it('reads HH:MM back, and nothing else', () => {
    expect(parseTimeInputValue('06:05')).toEqual({ hour: 6, minute: 5 });
    expect(parseTimeInputValue('23:59')).toEqual({ hour: 23, minute: 59 });
    expect(parseTimeInputValue('24:00')).toBeNull();
    expect(parseTimeInputValue('')).toBeNull();
    expect(parseTimeInputValue('7pm')).toBeNull();
  });
});
