import time
import threading
from pynput import mouse, keyboard
import requests
import json

class BackgroundWorker:
    def __init__(self, session_id, user_id, api_url="http://127.0.0.1:5000/api/background_data"):
        self.session_id = session_id
        self.user_id = user_id
        self.api_url = api_url
        self._stop_event = threading.Event()

        self.mouse_listener = mouse.Listener(
            on_move=self.on_move,
            on_click=self.on_click,
            on_scroll=self.on_scroll
        )
        self.keyboard_listener = keyboard.Listener(
            on_press=self.on_press,
            on_release=self.on_release
        )

        self.mouse_events = []
        self.keyboard_events = []

    def on_move(self, x, y):
        self.mouse_events.append({'type': 'move', 'x': x, 'y': y, 'timestamp': time.time()})

    def on_click(self, x, y, button, pressed):
        self.mouse_events.append({
            'type': 'click', 'x': x, 'y': y,
            'button': str(button), 'pressed': pressed, 'timestamp': time.time()
        })

    def on_scroll(self, x, y, dx, dy):
        self.mouse_events.append({
            'type': 'scroll', 'x': x, 'y': y,
            'dx': dx, 'dy': dy, 'timestamp': time.time()
        })

    def on_press(self, key):
        try:
            self.keyboard_events.append({
                'type': 'press', 'key': key.char, 'timestamp': time.time()
            })
        except AttributeError:
            self.keyboard_events.append({
                'type': 'press', 'key': str(key), 'timestamp': time.time()
            })

    def on_release(self, key):
        try:
            self.keyboard_events.append({
                'type': 'release', 'key': key.char, 'timestamp': time.time()
            })
        except AttributeError:
            self.keyboard_events.append({
                'type': 'release', 'key': str(key), 'timestamp': time.time()
            })

    def send_data(self):
        while not self._stop_event.is_set():
            time.sleep(5)  # Send data every 5 seconds
            if self.mouse_events or self.keyboard_events:
                data_to_send = {
                    "session_id": self.session_id,
                    "user_id": self.user_id,
                    "mouse_data": self.mouse_events,
                    "keyboard_data": self.keyboard_events
                }
                try:
                    requests.post(self.api_url, json=data_to_send)
                    self.mouse_events = []
                    self.keyboard_events = []
                except requests.exceptions.RequestException as e:
                    print(f"Could not send data: {e}")

    def start(self):
        self._stop_event.clear()
        self.mouse_listener.start()
        self.keyboard_listener.start()
        self.data_thread = threading.Thread(target=self.send_data)
        self.data_thread.start()
        print("Background worker started.")

    def stop(self):
        self._stop_event.set()
        self.mouse_listener.stop()
        self.keyboard_listener.stop()
        self.data_thread.join()
        print("Background worker stopped.")

if __name__ == '__main__':
    # This part is for testing the worker independently
    worker = BackgroundWorker("test_session", 1)
    worker.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        worker.stop()