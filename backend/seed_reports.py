from database import SessionLocal, BipReportConfig

def seed_database():
    print("Connecting directly to the database...")
    db = SessionLocal()
    
    try:
        test_report_1 = BipReportConfig(
            module="Finance",
            report_name="Q3_Revenue_Test",
            description="Bhaiya's test query for revenue",
            sql_query="SELECT 'TEST_DATA' as col1, 1000 as revenue FROM DUAL"
        )
        
        test_report_2 = BipReportConfig(
            module="HCM",
            report_name="Employee_Count",
            description="01_Pulls total active employees",
            sql_query="Select count(person_number) from per_all_people_f"
        )

        # Clean up existing test reports
        db.query(BipReportConfig).filter(BipReportConfig.report_name.in_(["Q3_Revenue_Test", "Employee_Count"])).delete()
        db.flush()

        # Inject into the database
        db.add(test_report_1)
        db.add(test_report_2)
        db.commit()
        
        print("Success! Test reports injected into the matrix.")
        
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
