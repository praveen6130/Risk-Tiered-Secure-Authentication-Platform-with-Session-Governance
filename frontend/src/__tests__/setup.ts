import '@testing-library/jest-dom'
import { vi } from 'vitest'

const storageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: storageMock,
  writable: true,
})

Object.defineProperty(window, 'sessionStorage', {
  value: storageMock,
  writable: true,
})

Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

Object.defineProperty(window, 'crypto', {
  writable: true,
  value: {
    randomUUID: () => 'test-uuid',
    getRandomValues: (arr: any) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256)
      }
      return arr
    },
  },
})

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillText: vi.fn(),
  getExtension: vi.fn(),
  getParameter: vi.fn(),
  createOscillator: vi.fn().mockReturnValue({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }),
  createAnalyser: vi.fn().mockReturnValue({
    connect: vi.fn(),
  }),
  createGain: vi.fn().mockReturnValue({
    connect: vi.fn(),
    gain: { value: 0 },
  }),
})

window.AudioContext = vi.fn().mockImplementation(() => ({
  createOscillator: vi.fn().mockReturnValue({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }),
  createAnalyser: vi.fn().mockReturnValue({
    connect: vi.fn(),
  }),
  createGain: vi.fn().mockReturnValue({
    connect: vi.fn(),
    gain: { value: 0 },
  }),
  destination: {},
  sampleRate: 44100,
  close: vi.fn(),
}))