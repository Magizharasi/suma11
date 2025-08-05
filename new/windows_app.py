import sys
from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QMenu, QAction
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import QObject, pyqtSignal
import threading
from werkzeug.serving import make_server
from app import create_app
from background_worker import BackgroundWorker
import webbrowser

# Handler for starting the worker from another thread
class StartWorkerHandler(QObject):
    start_signal = pyqtSignal()

# Handler for shutting down from another thread
class ShutdownHandler(QObject):
    shutdown_signal = pyqtSignal()

class ServerThread(threading.Thread):
    def __init__(self, app):
        threading.Thread.__init__(self)
        self.server = make_server('127.0.0.1', 5000, app)
        self.ctx = app.app_context()
        self.ctx.push()

    def run(self):
        self.server.serve_forever()

    def shutdown(self):
        self.server.shutdown()

class WindowsApp:
    def __init__(self):
        self.app = QApplication(sys.argv)
        self.tray_icon = QSystemTrayIcon(QIcon("icon.png"), self.app)
        self.server_thread = None
        self.background_worker = None

        # --- Handlers for safe cross-thread communication ---
        self.start_worker_handler = StartWorkerHandler()
        self.start_worker_handler.start_signal.connect(self.start_background_worker)
        self.shutdown_handler = ShutdownHandler()
        self.shutdown_handler.shutdown_signal.connect(self.logout)
        
        # Session info will be set after login in a real app
        self.session_id = "windows_session" 
        self.user_id = 1

    def start_server(self):
        flask_app, _ = create_app()
        # --- Give Flask a way to trigger the handlers ---
        flask_app.trigger_start_worker = self.start_worker_handler.start_signal.emit
        flask_app.trigger_shutdown = self.shutdown_handler.shutdown_signal.emit
        self.server_thread = ServerThread(flask_app)
        self.server_thread.start()
        print("Flask server started in a background thread.")

    def start_background_worker(self):
        if not self.background_worker:
            print("Start signal received. Starting background worker...")
            self.background_worker = BackgroundWorker(self.session_id, self.user_id)
            self.background_worker.start()
        else:
            print("Background worker is already running.")

    def stop_background_worker(self):
        if self.background_worker:
            self.background_worker.stop()
            self.background_worker = None

    def open_dashboard(self):
        webbrowser.open("http://127.0.0.1:5000/challenge")

    def logout(self):
        print("Logout triggered. Stopping background worker and exiting.")
        self.stop_background_worker()
        self.app.quit()

    def run(self):
        self.start_server()
        
        # --- MODIFIED: Open the LOGIN page first ---
        webbrowser.open("http://127.0.0.1:5000/login")
        
        # --- REMOVED: Do NOT start the worker here anymore ---
        # self.start_background_worker() 

        menu = QMenu()
        open_action = QAction("Open Dashboard", self.app)
        open_action.triggered.connect(self.open_dashboard)
        menu.addAction(open_action)
        
        logout_action = QAction("Logout", self.app)
        logout_action.triggered.connect(self.logout)
        menu.addAction(logout_action)
        
        exit_action = QAction("Exit", self.app)
        exit_action.triggered.connect(self.logout)
        menu.addAction(exit_action)
        
        self.tray_icon.setContextMenu(menu)
        self.tray_icon.show()
        
        sys.exit(self.app.exec_())

if __name__ == "__main__":
    win_app = WindowsApp()
    win_app.run()