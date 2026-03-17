from flask import Flask, request, redirect, url_for, session, render_template_string, render_template, g, jsonify
import sqlite3
import json
from datetime import datetime
import os
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "secret-key")

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE = os.path.join(BASE_DIR, "loan_app.db")


# -----------------------------
# DB HELPERS
# -----------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DATABASE)
    cursor = db.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS loan_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telecaller_name TEXT,
        call_date TEXT,
        lead_source TEXT,
        lead_ref TEXT,
        applicant_name TEXT,
        mobile TEXT,
        alternate_mobile TEXT,
        email TEXT,
        dob TEXT,
        gender TEXT,
        marital_status TEXT,
        city TEXT,
        state TEXT,
        address TEXT,
        loan_type TEXT,
        loan_amount REAL,
        loan_purpose TEXT,
        property_type TEXT,
        property_location TEXT,
        property_value REAL,
        emi_range TEXT,
        preferred_lender TEXT,
        urgency TEXT,
        employment_type TEXT,
        company_name TEXT,
        monthly_income REAL,
        experience TEXT,
        existing_emi REAL,
        cibil TEXT,
        income_proof TEXT,
        pan_available TEXT,
        aadhaar_available TEXT,
        bank_statement TEXT,
        itr_available TEXT,
        salary_slips TEXT,
        property_docs TEXT,
        lead_status TEXT,
        eligibility TEXT,
        follow_up_date TEXT,
        remarks TEXT,
        consent INTEGER DEFAULT 0,
        uploaded_files TEXT,
        extracted_text TEXT,
        raw_form_json TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS loan_chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_lead_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (loan_lead_id) REFERENCES loan_leads(id)
    )
    """)

    db.commit()
    db.close()


# -----------------------------
# LOGIN REQUIRED DECORATOR
# -----------------------------
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function


# -----------------------------
# AI PLACEHOLDER
# -----------------------------
def generate_ai_reply(user_message, form_data, conversation):
    applicant = str(form_data.get("applicantName", "")).strip()
    loan_type = str(form_data.get("loanType", "")).strip()
    loan_amount = str(form_data.get("loanAmount", "")).strip()
    employment_type = str(form_data.get("employmentType", "")).strip()
    monthly_income = str(form_data.get("monthlyIncome", "")).strip()

    summary_lines = []
    if applicant:
        summary_lines.append(f"Applicant: {applicant}")
    if loan_type:
        summary_lines.append(f"Loan Type: {loan_type}")
    if loan_amount:
        summary_lines.append(f"Loan Amount: ₹{loan_amount}")
    if employment_type:
        summary_lines.append(f"Employment Type: {employment_type}")
    if monthly_income:
        summary_lines.append(f"Monthly Income: ₹{monthly_income}")

    summary = "\n".join(summary_lines) if summary_lines else "No major form details captured yet."

    return (
        "Loan Assistant Response\n\n"
        f"You asked: {user_message}\n\n"
        f"Current lead snapshot:\n{summary}\n\n"
        "Next step suggestion:\n"
        "Please verify PAN, Aadhaar, income proof, bank statement, and repayment eligibility before final processing.\n\n"
        "Note: This is a Flask placeholder reply. You can replace generate_ai_reply() with Gemini later."
    )


# -----------------------------
# ROOT ROUTE
# -----------------------------
@app.route("/")
def root():
    return redirect(url_for("login"))


# -----------------------------
# LOGIN PAGE
# -----------------------------
@app.route("/login", methods=["GET"])
def login():
    error = request.args.get("error", "")
    return render_template_string("""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Login</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * { box-sizing: border-box; }
            body {
                margin: 0;
                font-family: Arial, sans-serif;
                background: linear-gradient(135deg, #e0ecff, #f8fbff);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
            }
            .box {
                width: 100%;
                max-width: 380px;
                background: #fff;
                padding: 35px;
                border-radius: 16px;
                box-shadow: 0 12px 32px rgba(0,0,0,0.12);
            }
            h2 {
                margin: 0 0 8px;
                text-align: center;
                color: #0f172a;
            }
            .sub {
                text-align: center;
                color: #64748b;
                margin-bottom: 20px;
                font-size: 14px;
            }
            .error {
                background: #fee2e2;
                color: #b91c1c;
                padding: 12px;
                border-radius: 10px;
                margin-bottom: 14px;
                text-align: center;
                font-size: 14px;
            }
            input {
                width: 100%;
                padding: 12px;
                margin-top: 10px;
                border: 1px solid #cbd5e1;
                border-radius: 10px;
                outline: none;
                font-size: 14px;
            }
            input:focus {
                border-color: #2563eb;
                box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
            }
            button {
                width: 100%;
                padding: 12px;
                margin-top: 16px;
                background: #2563eb;
                color: #fff;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                font-size: 15px;
                font-weight: bold;
            }
            button:hover {
                background: #1d4ed8;
            }
            a {
                display: block;
                text-align: center;
                margin-top: 14px;
                color: #2563eb;
                text-decoration: none;
                font-size: 14px;
            }
            a:hover {
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="box">
            <h2>Loan CRM Login</h2>
            <div class="sub">Sign in to access the dashboard</div>

            {% if error %}
                <div class="error">{{ error }}</div>
            {% endif %}

            <form method="POST" action="/login">
                <input name="username" placeholder="Enter username" required>
                <input type="password" name="password" placeholder="Enter password" required>
                <button type="submit">Login</button>
            </form>

            <a href="/register">Create Account</a>
        </div>
    </body>
    </html>
    """, error=error)


@app.route("/login", methods=["POST"])
def login_post():
    username = (request.form.get("username") or "").strip()
    password = (request.form.get("password") or "").strip()

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()

    if user and check_password_hash(user["password_hash"], password):
        session.clear()
        session["user_id"] = user["id"]
        session["user"] = user["username"]
        return redirect(url_for("dashboard"))

    return redirect(url_for("login", error="Invalid username or password"))


# -----------------------------
# REGISTER PAGE
# -----------------------------
@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        error = request.args.get("error", "")
        return render_template_string("""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Register</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { box-sizing: border-box; }
                body {
                    margin: 0;
                    font-family: Arial, sans-serif;
                    background: linear-gradient(135deg, #e0ecff, #f8fbff);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }
                .box {
                    width: 100%;
                    max-width: 380px;
                    background: #fff;
                    padding: 35px;
                    border-radius: 16px;
                    box-shadow: 0 12px 32px rgba(0,0,0,0.12);
                }
                h2 {
                    margin: 0 0 8px;
                    text-align: center;
                    color: #0f172a;
                }
                .sub {
                    text-align: center;
                    color: #64748b;
                    margin-bottom: 20px;
                    font-size: 14px;
                }
                .error {
                    background: #fee2e2;
                    color: #b91c1c;
                    padding: 12px;
                    border-radius: 10px;
                    margin-bottom: 14px;
                    text-align: center;
                    font-size: 14px;
                }
                input {
                    width: 100%;
                    padding: 12px;
                    margin-top: 10px;
                    border: 1px solid #cbd5e1;
                    border-radius: 10px;
                    outline: none;
                    font-size: 14px;
                }
                input:focus {
                    border-color: #16a34a;
                    box-shadow: 0 0 0 3px rgba(22,163,74,0.12);
                }
                button {
                    width: 100%;
                    padding: 12px;
                    margin-top: 16px;
                    background: #16a34a;
                    color: #fff;
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 15px;
                    font-weight: bold;
                }
                button:hover {
                    background: #15803d;
                }
                a {
                    display: block;
                    text-align: center;
                    margin-top: 14px;
                    color: #2563eb;
                    text-decoration: none;
                    font-size: 14px;
                }
                a:hover {
                    text-decoration: underline;
                }
            </style>
        </head>
        <body>
            <div class="box">
                <h2>Create Account</h2>
                <div class="sub">Register a new user to access the system</div>

                {% if error %}
                    <div class="error">{{ error }}</div>
                {% endif %}

                <form method="POST" action="/register">
                    <input name="username" placeholder="Choose username" required>
                    <input type="password" name="password" placeholder="Choose password" required>
                    <button type="submit">Create Account</button>
                </form>

                <a href="/login">Back to Login</a>
            </div>
        </body>
        </html>
        """, error=error)

    username = (request.form.get("username") or "").strip()
    password = (request.form.get("password") or "").strip()

    if not username or not password:
        return redirect(url_for("register", error="Username and password are required"))

    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        )
        db.commit()
        return redirect(url_for("login"))
    except sqlite3.IntegrityError:
        return redirect(url_for("register", error="Username already exists"))


# -----------------------------
# DASHBOARD -> REAL INDEX FILE
# -----------------------------
@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("index.html", user=session.get("user"))


# -----------------------------
# SAVE LEAD API
# -----------------------------
@app.route("/api/save-loan-lead", methods=["POST"])
@login_required
def save_loan_lead():
    try:
        data = request.get_json(force=True) or {}
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        db = get_db()
        cursor = db.cursor()

        cursor.execute("""
        INSERT INTO loan_leads (
            telecaller_name, call_date, lead_source, lead_ref,
            applicant_name, mobile, alternate_mobile, email, dob, gender,
            marital_status, city, state, address,
            loan_type, loan_amount, loan_purpose, property_type, property_location,
            property_value, emi_range, preferred_lender, urgency,
            employment_type, company_name, monthly_income, experience,
            existing_emi, cibil, income_proof,
            pan_available, aadhaar_available, bank_statement, itr_available,
            salary_slips, property_docs,
            lead_status, eligibility, follow_up_date, remarks,
            consent, uploaded_files, extracted_text, raw_form_json,
            created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("telecallerName"),
            data.get("callDate"),
            data.get("leadSource"),
            data.get("leadId"),
            data.get("applicantName"),
            data.get("mobile"),
            data.get("alternateMobile"),
            data.get("email"),
            data.get("dob"),
            data.get("gender"),
            data.get("maritalStatus"),
            data.get("city"),
            data.get("state"),
            data.get("address"),
            data.get("loanType"),
            data.get("loanAmount"),
            data.get("loanPurpose"),
            data.get("propertyType"),
            data.get("propertyLocation"),
            data.get("propertyValue"),
            data.get("emiRange"),
            data.get("preferredLender"),
            data.get("urgency"),
            data.get("employmentType"),
            data.get("companyName"),
            data.get("monthlyIncome"),
            data.get("experience"),
            data.get("existingEmi"),
            data.get("cibil"),
            data.get("incomeProof"),
            data.get("panAvailable"),
            data.get("aadhaarAvailable"),
            data.get("bankStatement"),
            data.get("itrAvailable"),
            data.get("salarySlips"),
            data.get("propertyDocs"),
            data.get("leadStatus"),
            data.get("eligibility"),
            data.get("followUpDate"),
            data.get("remarks"),
            1 if data.get("consent") else 0,
            json.dumps(data.get("uploadedFiles", []), ensure_ascii=False),
            data.get("extractedText", ""),
            json.dumps(data, ensure_ascii=False),
            now,
            now
        ))

        lead_db_id = cursor.lastrowid
        db.commit()

        return jsonify({
            "success": True,
            "lead_db_id": lead_db_id,
            "message": "Lead saved successfully."
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Failed to save lead: {str(e)}"
        }), 500


# -----------------------------
# AI CHAT API
# -----------------------------
@app.route("/api/loan-ai-chat", methods=["POST"])
@login_required
def loan_ai_chat():
    try:
        payload = request.get_json(force=True) or {}

        lead_db_id = payload.get("leadDbId")
        user_message = (payload.get("message") or "").strip()
        form_data = payload.get("formData") or {}
        conversation = payload.get("conversation") or []

        if not lead_db_id:
            return jsonify({
                "success": False,
                "reply": "Please save the lead first before starting the tracked chat."
            }), 400

        if not user_message:
            return jsonify({
                "success": False,
                "reply": "Message is required."
            }), 400

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db = get_db()
        cursor = db.cursor()

        cursor.execute("""
        INSERT INTO loan_chat_history (loan_lead_id, role, message, created_at)
        VALUES (?, ?, ?, ?)
        """, (lead_db_id, "user", user_message, now))

        ai_reply = generate_ai_reply(user_message, form_data, conversation)

        cursor.execute("""
        INSERT INTO loan_chat_history (loan_lead_id, role, message, created_at)
        VALUES (?, ?, ?, ?)
        """, (lead_db_id, "assistant", ai_reply, now))

        cursor.execute("""
        UPDATE loan_leads
        SET updated_at = ?
        WHERE id = ?
        """, (now, lead_db_id))

        db.commit()

        return jsonify({
            "success": True,
            "reply": ai_reply
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "reply": f"Backend error: {str(e)}"
        }), 500


# -----------------------------
# LEADS LIST
# -----------------------------
@app.route("/leads")
@login_required
def leads():
    db = get_db()
    rows = db.execute("""
        SELECT id, applicant_name, mobile, loan_type, loan_amount,
               telecaller_name, lead_status, created_at, updated_at
        FROM loan_leads
        ORDER BY id DESC
    """).fetchall()

    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Saved Leads</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f8fafc; }
            h1 { color: #0f172a; }
            table { width: 100%; border-collapse: collapse; background: #fff; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #0f172a; color: #fff; }
            a { color: #2563eb; text-decoration: none; }
            .wrap { max-width: 1200px; margin: auto; }
            .topbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            .logout-btn {
                background: #dc2626;
                color: #fff;
                padding: 10px 14px;
                border-radius: 8px;
                text-decoration: none;
                font-size: 14px;
            }
            .home-btn {
                background: #2563eb;
                color: #fff;
                padding: 10px 14px;
                border-radius: 8px;
                text-decoration: none;
                font-size: 14px;
                margin-right: 10px;
            }
            .actions {
                display: flex;
                gap: 10px;
            }
        </style>
    </head>
    <body>
    <div class="wrap">
        <div class="topbar">
            <h1>Saved Leads</h1>
            <div class="actions">
                <a class="home-btn" href="/dashboard">Dashboard</a>
                <a class="logout-btn" href="/logout">Logout</a>
            </div>
        </div>
        <table>
            <tr>
                <th>ID</th>
                <th>Applicant</th>
                <th>Mobile</th>
                <th>Loan Type</th>
                <th>Loan Amount</th>
                <th>Telecaller</th>
                <th>Status</th>
                <th>Created</th>
                <th>View</th>
            </tr>
    """

    for row in rows:
        html += f"""
            <tr>
                <td>{row['id']}</td>
                <td>{row['applicant_name'] or ''}</td>
                <td>{row['mobile'] or ''}</td>
                <td>{row['loan_type'] or ''}</td>
                <td>{row['loan_amount'] or ''}</td>
                <td>{row['telecaller_name'] or ''}</td>
                <td>{row['lead_status'] or ''}</td>
                <td>{row['created_at'] or ''}</td>
                <td><a href="/lead/{row['id']}">Open</a></td>
            </tr>
        """

    html += """
        </table>
    </div>
    </body>
    </html>
    """
    return html


# -----------------------------
# LEAD DETAIL
# -----------------------------
@app.route("/lead/<int:lead_id>")
@login_required
def lead_detail(lead_id):
    db = get_db()

    lead = db.execute("SELECT * FROM loan_leads WHERE id = ?", (lead_id,)).fetchone()
    chats = db.execute("""
        SELECT role, message, created_at
        FROM loan_chat_history
        WHERE loan_lead_id = ?
        ORDER BY id ASC
    """, (lead_id,)).fetchall()

    if not lead:
        return "Lead not found", 404

    def safe(v):
        return "" if v is None else str(v)

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Lead #{lead_id}</title>
        <style>
            body {{ font-family: Arial, sans-serif; padding: 20px; background: #f8fafc; }}
            .wrap {{ max-width: 1100px; margin: auto; }}
            .card {{ background: #fff; padding: 20px; border-radius: 14px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,.06); }}
            h1, h2 {{ color: #0f172a; }}
            .grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }}
            .item {{ padding: 10px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }}
            .chat {{ margin-top: 14px; }}
            .msg {{ padding: 12px; border-radius: 10px; margin-bottom: 10px; white-space: pre-wrap; }}
            .user {{ background: #dbeafe; }}
            .assistant {{ background: #dcfce7; }}
            .time {{ font-size: 12px; color: #475569; margin-top: 6px; }}
            a {{ color: #2563eb; text-decoration: none; }}
            .top-links {{ margin-bottom: 15px; }}
        </style>
    </head>
    <body>
    <div class="wrap">
        <div class="top-links">
            <p><a href="/leads">← Back to leads</a> | <a href="/dashboard">Dashboard</a> | <a href="/logout">Logout</a></p>
        </div>

        <div class="card">
            <h1>Lead #{lead_id}</h1>
            <div class="grid">
                <div class="item"><strong>Applicant:</strong> {safe(lead['applicant_name'])}</div>
                <div class="item"><strong>Mobile:</strong> {safe(lead['mobile'])}</div>
                <div class="item"><strong>Email:</strong> {safe(lead['email'])}</div>
                <div class="item"><strong>Telecaller:</strong> {safe(lead['telecaller_name'])}</div>
                <div class="item"><strong>Loan Type:</strong> {safe(lead['loan_type'])}</div>
                <div class="item"><strong>Loan Amount:</strong> {safe(lead['loan_amount'])}</div>
                <div class="item"><strong>City:</strong> {safe(lead['city'])}</div>
                <div class="item"><strong>State:</strong> {safe(lead['state'])}</div>
                <div class="item"><strong>Employment Type:</strong> {safe(lead['employment_type'])}</div>
                <div class="item"><strong>Monthly Income:</strong> {safe(lead['monthly_income'])}</div>
                <div class="item"><strong>Lead Status:</strong> {safe(lead['lead_status'])}</div>
                <div class="item"><strong>Created At:</strong> {safe(lead['created_at'])}</div>
            </div>
        </div>

        <div class="card">
            <h2>Chat History</h2>
    """

    if not chats:
        html += "<p>No chat history found.</p>"
    else:
        for chat in chats:
            cls = "user" if chat["role"] == "user" else "assistant"
            html += f"""
                <div class="chat">
                    <div class="msg {cls}">
                        <strong>{chat['role'].upper()}</strong><br><br>
                        {safe(chat['message'])}
                        <div class="time">{safe(chat['created_at'])}</div>
                    </div>
                </div>
            """

    html += """
        </div>
    </div>
    </body>
    </html>
    """
    return html


# -----------------------------
# LOGOUT
# -----------------------------
@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# -----------------------------
# RUN
# -----------------------------
if __name__ == "__main__":
    init_db()
    app.run(debug=True)