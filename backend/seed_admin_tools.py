from database import SessionLocal, User, UserToolAccess

db = SessionLocal()
admin = db.query(User).filter_by(email='sruidas@modernmindsolutionsllc.com').first()
print(f"Admin ID: {admin.id}")

# Clear existing
db.query(UserToolAccess).filter_by(user_id=admin.id).delete()
db.flush()

# Add all 4 tools
for t in ['config_snapshot', 'data_conversion', 'bip_reporting', 'payroll']:
    db.add(UserToolAccess(user_id=admin.id, tool_key=t))

db.commit()

# Verify
tools = db.query(UserToolAccess).filter_by(user_id=admin.id).all()
print("Admin tools now:", [t.tool_key for t in tools])
db.close()
