from flask import Flask, request, jsonify
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.metrics import accuracy_score
import numpy as np
import requests
import json
import os
from threading import Lock
import logging
from datetime import datetime
import traceback

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Constants for stake and slashing
INITIAL_STAKE = 1000  # Initial deposit in euros
SLASHING_THRESHOLD = 0.6  # Accuracy threshold below which slashing occurs
SLASH_PERCENTAGE = 0.1  # Percentage of stake to slash
MIN_STAKE_REQUIRED = 100  # Minimum stake required to participate

class StakeDatabase:
    def __init__(self, db_file="stake_database.json"):
        self.db_file = db_file
        self.lock = Lock()
        self._initialize_db()
    
    def _initialize_db(self):
        # Always start with a fresh database
        initial_data = {
            "models": {},
            "transaction_history": []
        }
        self._save_db(initial_data)
    
    def _load_db(self):
        with open(self.db_file, 'r') as f:
            return json.load(f)
    
    def _save_db(self, data):
        with open(self.db_file, 'w') as f:
            json.dump(data, f, indent=4)
    
    def register_model(self, model_id, initial_stake=INITIAL_STAKE):
        with self.lock:
            db_data = self._load_db()
            if model_id not in db_data["models"]:
                db_data["models"][model_id] = {
                    "stake": initial_stake,
                    "weight": 1.0,
                    "prediction_history": [],
                    "accuracy_history": []
                }
                db_data["transaction_history"].append({
                    "timestamp": datetime.now().isoformat(),
                    "model_id": model_id,
                    "type": "registration",
                    "amount": initial_stake
                })
                self._save_db(db_data)
                return True
            return False

    def update_model_performance(self, model_id, accuracy, prediction):
        with self.lock:
            db_data = self._load_db()
            if model_id in db_data["models"]:
                model_data = db_data["models"][model_id]
                
                # Update accuracy history
                model_data["accuracy_history"].append(accuracy)
                model_data["prediction_history"].append(prediction)
                
                # Keep only last 10 predictions
                if len(model_data["accuracy_history"]) > 10:
                    model_data["accuracy_history"] = model_data["accuracy_history"][-10:]
                    model_data["prediction_history"] = model_data["prediction_history"][-10:]
                
                # Calculate new weight based on recent performance
                avg_accuracy = np.mean(model_data["accuracy_history"])
                model_data["weight"] = max(0.1, avg_accuracy)
                
                # Apply slashing if necessary
                if avg_accuracy < SLASHING_THRESHOLD:
                    slash_amount = model_data["stake"] * SLASH_PERCENTAGE
                    model_data["stake"] -= slash_amount
                    db_data["transaction_history"].append({
                        "timestamp": datetime.now().isoformat(),
                        "model_id": model_id,
                        "type": "slash",
                        "amount": slash_amount,
                        "reason": f"Low accuracy: {avg_accuracy:.2f}"
                    })
                
                self._save_db(db_data)
                return model_data["weight"], model_data["stake"]
            return None, None

class BaseModel:
    def __init__(self, model_type, model_name):
        self.model = model_type()
        self.model_name = model_name
        self.model_id = f"{model_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.is_trained = False
        
    def train(self, X, y):
        self.model.fit(X, y)
        self.is_trained = True
        
    def predict(self, X):
        if not self.is_trained:
            raise ValueError("Model not trained yet")
        return self.model.predict_proba(X)

class DistributedPredictionSystem:
    def __init__(self, stake_db):
        self.stake_db = stake_db
        # Initialize different model types
        self.models = {
            "random_forest": BaseModel(RandomForestClassifier, "RandomForest"),
            "logistic": BaseModel(LogisticRegression, "LogisticRegression"),
            "svm": BaseModel(lambda: SVC(probability=True), "SVM")
        }
        self.peer_nodes = set()
        
        # Register all models with the stake database
        for model in self.models.values():
            self.stake_db.register_model(model.model_id)
        
    def train_all_models(self, X, y):
        for model in self.models.values():
            model.train(X, y)
            
    def get_weighted_consensus_prediction(self, X, include_peers=True):
        predictions = []
        model_ids = []
        
        # Get local model predictions
        for model in self.models.values():
            try:
                pred = model.predict(X)
                predictions.append(pred)
                model_ids.append(model.model_id)
            except Exception as e:
                logging.error(f"Error in local prediction: {str(e)}")
        
        # Get predictions from peer nodes if enabled
        if include_peers:
            for peer in self.peer_nodes:
                try:
                    response = requests.post(
                        f"{peer}/predict",
                        json={"features": X.tolist()}
                    )
                    if response.status_code == 200:
                        data = response.json()
                        predictions.append(np.array(data["prediction"]))
                        model_ids.append(data["model_id"])
                except Exception as e:
                    logging.error(f"Error getting prediction from peer {peer}: {str(e)}")
        
        # Calculate weighted consensus
        all_models = self.stake_db._load_db()["models"]
        total_weight = 0
        weighted_sum = np.zeros_like(predictions[0])
        
        for pred, model_id in zip(predictions, model_ids):
            if model_id in all_models:
                model_data = all_models[model_id]
                if model_data["stake"] >= MIN_STAKE_REQUIRED:
                    weight = model_data["weight"]
                    weighted_sum += pred * weight
                    total_weight += weight
        
        if total_weight == 0:
            raise ValueError("No eligible models for prediction")
            
        return weighted_sum / total_weight

# Initialize the system
stake_db = StakeDatabase()
prediction_system = DistributedPredictionSystem(stake_db)

@app.route('/', methods=['GET'])
def index():
    """Root endpoint to check if server is running"""
    try:
        routes = {}
        for rule in app.url_map.iter_rules():
            routes[str(rule)] = list(rule.methods)
        response = jsonify({
            "status": "Server is running",
            "message": "Welcome to the Distributed Prediction System",
            "available_routes": routes
        })
        response.headers.add('Access-Control-Allow-Origin', '*')
        return response
    except Exception as e:
        print(f"Error in index route: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/train', methods=['POST'])
def train():
    try:
        # Load Iris dataset for demonstration
        iris = load_iris()
        X_train, _, y_train, _ = train_test_split(
            iris.data, iris.target, test_size=0.2
        )
        
        prediction_system.train_all_models(X_train, y_train)
        
        return jsonify({"status": "success", "message": "Models trained successfully"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        features = np.array(data["features"]).reshape(1, -1)
        true_value = data.get("true_value")
        
        prediction = prediction_system.get_weighted_consensus_prediction(
            features,
            include_peers=data.get("include_peers", True)
        )
        
        # Update performance if true value is provided
        if true_value is not None:
            for model in prediction_system.models.values():
                model_pred = model.predict(features)
                accuracy = 1 - np.mean(np.abs(model_pred - true_value))
                stake_db.update_model_performance(model.model_id, accuracy, model_pred.tolist())
        
        return jsonify({
            "status": "success",
            "prediction": prediction.tolist()
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/register_peer', methods=['POST'])
def register_peer():
    try:
        data = request.get_json()
        peer_url = data["peer_url"]
        prediction_system.peer_nodes.add(peer_url)
        return jsonify({
            "status": "success",
            "message": f"Peer {peer_url} registered successfully"
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/list_models', methods=['GET'])
def list_models():
    try:
        db_data = stake_db._load_db()
        return jsonify({
            "status": "success",
            "models": list(db_data["models"].keys())
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/model_info/<model_id>', methods=['GET'])
def get_model_info(model_id):
    try:
        db_data = stake_db._load_db()
        if model_id in db_data["models"]:
            return jsonify({
                "status": "success",
                "data": db_data["models"][model_id]
            })
        return jsonify({
            "status": "error",
            "message": "Model not found"
        }), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    print("\nAvailable routes at startup:")
    for rule in app.url_map.iter_rules():
        print(f"  {rule} [{', '.join(rule.methods)}]")
    print("\nStarting server...")
    
    # Enable more detailed logging
    logging.getLogger('werkzeug').setLevel(logging.DEBUG)
    
    app.run(
        host='0.0.0.0',
        port=5001,  # Changed port to 5001
        debug=True,
        use_reloader=True
    )