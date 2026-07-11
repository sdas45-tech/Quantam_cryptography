import numpy as np
import tkinter as tk
from tkinter import messagebox, filedialog, simpledialog
import base64
import os

# BB84 Quantum Key Distribution Simulation
def generate_random_bits(length):
    return np.random.randint(0, 2, length)

def generate_bases(length):
    return np.random.randint(0, 2, length)

def encode_qubits(bits, bases):
    return [(bit, basis) for bit, basis in zip(bits, bases)]

def simulate_measurement(qubits, receiver_bases):
    receiver_bits = []
    for (bit, s_basis), r_basis in zip(qubits, receiver_bases):
        if s_basis == r_basis:
            receiver_bits.append(bit)
        else:
            receiver_bits.append(np.random.randint(0, 2))
    return np.array(receiver_bits)

def reconcile_keys(sender_bases, receiver_bases, sender_bits, receiver_bits):
    valid_indices = sender_bases == receiver_bases
    return sender_bits[valid_indices], receiver_bits[valid_indices]

def simulate_bb84_protocol(key_length=16):
    alice_bits = generate_random_bits(key_length)
    alice_bases = generate_bases(key_length)
    qubits = encode_qubits(alice_bits, alice_bases)
    bob_bases = generate_bases(key_length)
    bob_bits = simulate_measurement(qubits, bob_bases)
    alice_key, _ = reconcile_keys(alice_bases, bob_bases, alice_bits, bob_bits)
    return ''.join(map(str, alice_key))

def xor_encrypt_decrypt(binary_msg, key):
    if not key:
        return binary_msg
    extended_key = (key * (len(binary_msg) // len(key) + 1))[:len(binary_msg)]
    return ''.join('1' if b != k else '0' for b, k in zip(binary_msg, extended_key))

# Convert text to binary (qubits) and vice versa
def convert_text_to_qubits(text):
    return ''.join(format(ord(char), '08b') for char in text)

def convert_qubits_to_text(qubits):
    chars = [chr(int(qubits[i:i+8], 2)) for i in range(0, len(qubits), 8)]
    return ''.join(chars)

# Encryption Function
def encrypt_message():
    encryption_key = simulate_bb84_protocol(128)  # Generate a secure quantum key
    while not encryption_key:
        encryption_key = simulate_bb84_protocol(128)
        
    message = message_entry.get()
    
    if not message:
        messagebox.showerror("Error", "Message is required.")
        return
    
    message_qubits = convert_text_to_qubits(message)  # Convert text to binary qubits
    encrypted_qubits = xor_encrypt_decrypt(message_qubits, encryption_key)  # Real XOR Encryption
    encoded = base64.b64encode(encrypted_qubits.encode()).decode()  # Encode in Base64

    # Suggest a filename based on encryption key
    default_filename = f"encrypted_message_{encryption_key[:6]}.txt"
    file_path = filedialog.asksaveasfilename(initialfile=default_filename, defaultextension=".txt", filetypes=[("Text files", "*.txt")])
    
    if file_path:
        with open(file_path, "w") as file:
            file.write(encryption_key + "\n" + encoded)  # Save passkey + encrypted data
        
        encrypted_message_label.config(text=f"Encrypted Message Saved!")
        messagebox.showinfo("Success", f"Message Encrypted and Saved!\nPasskey: {encryption_key}")

        # Open the directory where the file is saved
        os.startfile(os.path.dirname(file_path)) if os.name == "nt" else os.system(f'xdg-open "{os.path.dirname(file_path)}"')

# Decryption Function
def decrypt_message():
    file_path = filedialog.askopenfilename(filetypes=[("Text files", "*.txt")])

    if not file_path:
        messagebox.showerror("Error", "Please select an encrypted file.")
        return

    # Check if the file exists
    if not os.path.exists(file_path):
        messagebox.showerror("Error", "Selected file does not exist.")
        return

    try:
        with open(file_path, "r") as file:
            lines = file.readlines()
            stored_key = lines[0].strip()  # Extract stored passkey
            encoded_message = ''.join(lines[1:]).strip()  # Extract encrypted message

        # Ask user for passkey
        user_key = simpledialog.askstring("Passkey", "Enter the passkey to decrypt:")
        if user_key != stored_key:
            messagebox.showerror("Error", "Incorrect passkey!")
            return
        
        # Decode and decrypt message
        decoded = base64.b64decode(encoded_message).decode()
        decrypted_qubits = xor_encrypt_decrypt(decoded, user_key)  # Real XOR Decryption
        decrypted_message = convert_qubits_to_text(decrypted_qubits)
        
        decrypted_message_label.config(text=f"Decrypted Message:\n{decrypted_message}")
        messagebox.showinfo("Success", "Message Decrypted Successfully!")

    except Exception as e:
        messagebox.showerror("Error", f"Failed to decrypt message: {str(e)}")

# GUI Setup
root = tk.Tk()
root.title("BB84 Quantum Encryption & Decryption")
root.geometry("450x350")

message_label = tk.Label(root, text="Enter Message to Encrypt:")
message_label.pack(pady=5)

message_entry = tk.Entry(root, width=50)
message_entry.pack(pady=5)

encrypt_button = tk.Button(root, text="Encrypt Message", command=encrypt_message)
encrypt_button.pack(pady=10)

encrypted_message_label = tk.Label(root, text="Encrypted Message will be saved to a file.")
encrypted_message_label.pack(pady=10)

decrypt_button = tk.Button(root, text="Decrypt Message from File", command=decrypt_message)
decrypt_button.pack(pady=10)

decrypted_message_label = tk.Label(root, text="Decrypted Message will appear here.")
decrypted_message_label.pack(pady=10)

root.mainloop()
